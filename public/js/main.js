// SOCKET LISTENERS

socket.on('task_created', (data) => {

    if (pendingTempTracks.length > 0) {
        library = library.map(track => {
            if (pendingTempTracks.includes(track.id)) {
                return { ...track, taskId: data.taskId };
            }
            return track;
        });
        saveLibrary();
        pendingTempTracks = [];
    }
});

// Ошибка создания (например, 402 Insufficient credits)
socket.on('task_failed_creation', (data) => {
    // Тихо удаляем фейковые карточки, пользователь увидит ошибку в Logs tab
    removePendingTracks();

    if (window.showNotification && data && data.msg) {
        window.showNotification(data.msg);
    }
});

socket.on('error_message', (msg) => {
    // В Logs tab это попадет через api_log, здесь ничего не делаем, чтобы не спамить
});

socket.on('api_error', (payload) => {
    if (window.showNotification && payload && payload.message) {
        window.showNotification(payload.message);
    }
});

socket.on('api_log', logApi);

socket.on('task_update', (data) => {
    const { taskId, status, tracks, errorMessage } = data;

    // 1. ПРОВЕРКА НА ОШИБКУ
    const isError = status.includes('FAILED') || 
                    status === 'SENSITIVE_WORD_ERROR' || 
                    status === 'CALLBACK_EXCEPTION';

    if (isError) {
        // ОСТАНОВКА ПРОЦЕССА
        
        // Находим карточки с этим taskId
        const hasTrack = library.some(t => t.taskId === taskId);
        
        if (hasTrack) {
            // Удаляем их из библиотеки (визуально карточка исчезнет)
            library = library.filter(t => t.taskId !== taskId);
            
            // Чистим все таймеры
            for (let id in progressTimers) {
                // Если таймер не принадлежит ни одному живому треку - удаляем
                if (!library.find(t => t.id === id)) {
                    clearInterval(progressTimers[id]);
                    delete progressTimers[id];
                }
            }
            
            saveLibrary();
            renderLibrary();
        }
        
        // Никаких alert(). Вся информация об ошибке уже есть во вкладке Logs (событие api_log)
        return;
    }

    // 2. ОБРАБОТКА УСПЕХА
    if (tracks && tracks.length > 0) {
        let needsRender = false;
        
        tracks.forEach((serverTrack) => {
            let existingIndex = library.findIndex(t => t.id === serverTrack.id);
            
            if (existingIndex === -1) {
                existingIndex = library.findIndex(t => t.taskId === taskId && t.id.startsWith('temp_'));
                if (existingIndex !== -1) {
                    const tempId = library[existingIndex].id;
                    if (progressTimers[tempId]) { 
                        clearInterval(progressTimers[tempId]); 
                        delete progressTimers[tempId]; 
                    }
                }
            }

            let modelToSave = serverTrack.model_name;
            if (!modelToSave && existingIndex !== -1) modelToSave = library[existingIndex].model_name;

            const currentProgress = library[existingIndex]?.progress || 0;
            const trackObj = {
                id: serverTrack.id,
                taskId: taskId,
                title: serverTrack.title || (existingIndex !== -1 ? library[existingIndex].title : "Generating..."),
                tags: serverTrack.tags || (existingIndex !== -1 ? library[existingIndex].tags : ""),
                imageUrl: serverTrack.imageUrl || 'https://placehold.co/100/18181b/ffffff?text=Loading',
                audioUrl: serverTrack.audioUrl || '',
                duration: serverTrack.duration || 0,
                status: (status === 'SUCCESS') ? 'complete' : 'generating',
                model_name: modelToSave || 'AI',
                lyrics: serverTrack.prompt || "",
                progress: (status === 'SUCCESS') ? 100 : currentProgress
            };

            if (existingIndex !== -1) {
                library[existingIndex] = { ...library[existingIndex], ...trackObj };
                // Continue progress simulation if track is still generating and progress < 100
                if (status !== 'SUCCESS' && currentProgress < 100) {
                    simulateProgress(serverTrack.id);
                }
            } else {
                library.unshift(trackObj);
                // Start progress simulation for new tracks that aren't complete
                if (status !== 'SUCCESS') {
                    simulateProgress(serverTrack.id);
                }
            }
            needsRender = true;
        });

        if (needsRender) {
            saveLibrary();
            renderLibrary();
        }
    }
});

// Handle download URL response
socket.on('download_url_ready', (data) => {
    const { downloadUrl, trackId } = data;
    const track = library.find(t => t.id === trackId);
    
    if (!track) return;

    // Create direct download link
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `${track.title}.mp3`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Reset menu state
    const menu = document.getElementById(`menu-${trackId}`);
    if (menu) {
        const downloadItem = menu.querySelector('.dropdown-item:nth-child(4)');
        if (downloadItem) {
            downloadItem.innerHTML = '<i class="fa-solid fa-download"></i> Download';
            downloadItem.style.pointerEvents = 'auto';
        }
    }

    // Log successful download
    logApi({
        type: 'success',
        msg: `Download started for track: ${track.title}`,
        timestamp: new Date().toISOString()
    });
});

// Handle download error
socket.on('download_error', (data) => {
    const { error, trackId } = data;
    const track = library.find(t => t.id === trackId);
    
    // Reset menu state
    const menu = document.getElementById(`menu-${trackId}`);
    if (menu) {
        const downloadItem = menu.querySelector('.dropdown-item:nth-child(4)');
        if (downloadItem) {
            downloadItem.innerHTML = '<i class="fa-solid fa-download"></i> Download';
            downloadItem.style.pointerEvents = 'auto';
        }
    }

    // Log error
    logApi({
        type: 'error',
        msg: `Download failed for track ${track?.title || 'unknown'}: ${error}`,
        timestamp: new Date().toISOString()
    });
});

function removePendingTracks() {
    if (pendingTempTracks.length > 0) {
        pendingTempTracks.forEach(tempId => {
            if (progressTimers[tempId]) { 
                clearInterval(progressTimers[tempId]); 
                delete progressTimers[tempId]; 
            }
        });
        library = library.filter(track => !pendingTempTracks.includes(track.id));
        saveLibrary();
        renderLibrary();
        pendingTempTracks = [];
    }
}

function createFakeGeneration(model, title, tags, lyrics) {
    const now = new Date().toISOString();
    const id1 = 'temp_' + Date.now() + '_1';
    const id2 = 'temp_' + Date.now() + '_2';
    
    const newTracks = [
        { id: id1, title, tags, imageUrl: 'https://placehold.co/100/18181b/ffffff?text=Generating', audioUrl: '', model_name: model, status: 'generating', progress: 0, createdAt: now, lyrics: lyrics || "Processing..." },
        { id: id2, title, tags, imageUrl: 'https://placehold.co/100/18181b/ffffff?text=Generating', audioUrl: '', model_name: model, status: 'generating', progress: 0, createdAt: now, lyrics: lyrics || "Processing..." }
    ];
    
    library = [...newTracks, ...library];
    renderLibrary();
    simulateProgress(id1);
    simulateProgress(id2);
    
    return [id1, id2];
}

function simulateProgress(trackId) {
    const trackIndex = library.findIndex(t => t.id === trackId);
    if (trackIndex === -1) return;
    
    let progress = library[trackIndex].progress || 0;
    if (progressTimers[trackId]) clearInterval(progressTimers[trackId]);
    progressTimers[trackId] = setInterval(() => {
        progress += 0.8;
        const trackIndex = library.findIndex(t => t.id === trackId);
        if (trackIndex !== -1) {
            library[trackIndex].progress = progress;
            const card = document.querySelector(`[data-id="${trackId}"]`);
            if (card) {
                const bar = card.querySelector('.loading-progress');
                if (bar) bar.style.width = `${progress}%`;
            }
            if (progress >= 100) {
                clearInterval(progressTimers[trackId]);
                // Update the track status to show completion visually
                const trackIndex = library.findIndex(t => t.id === trackId);
                if (trackIndex !== -1) {
                    library[trackIndex].progress = 100;
                    const card = document.querySelector(`[data-id="${trackId}"]`);
                    if (card) {
                        const bar = card.querySelector('.loading-progress');
                        if (bar) bar.style.width = '100%';
                    }
                }
            }
        } else {
            clearInterval(progressTimers[trackId]);
            delete progressTimers[trackId];
        }
    }, 1000);
}

loadLibrary();