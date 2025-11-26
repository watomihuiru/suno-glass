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
});

socket.on('error_message', (msg) => {
    // В Logs tab это попадет через api_log, здесь ничего не делаем, чтобы не спамить
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
                lyrics: serverTrack.prompt || ""
            };

            if (existingIndex !== -1) {
                library[existingIndex] = { ...library[existingIndex], ...trackObj };
            } else {
                library.unshift(trackObj);
            }
            needsRender = true;
        });

        if (needsRender) {
            saveLibrary();
            renderLibrary();
        }
    }
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
    let progress = 0;
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
            if (progress >= 95) clearInterval(progressTimers[trackId]);
        } else {
            clearInterval(progressTimers[trackId]);
            delete progressTimers[trackId];
        }
    }, 1000);
}

loadLibrary();