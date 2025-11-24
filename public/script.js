document.addEventListener('DOMContentLoaded', () => {
    
    const socket = io();

    let library = []; 
    let currentTrackId = null; 
    let isPlaying = false;
    let progressTimers = {}; 
    
    // Глобальная переменная для временного хранения ID фейков
    // Используем Map для надежности, чтобы не перезатереть при быстрой генерации
    let pendingTempTracks = [];

    function loadLibrary() {
        const stored = localStorage.getItem('suno_library');
        if (stored) {
            library = JSON.parse(stored);
            // Очистка "зависших" генераций при перезагрузке, если они старше 10 минут
            // или просто сброс статуса, если нужно. Пока оставим как есть.
            renderLibrary();
        }
    }
    function saveLibrary() {
        localStorage.setItem('suno_library', JSON.stringify(library));
    }

    function getDisplayModelName(rawName) {
        if (!rawName) return 'AI';
        const lower = rawName.toLowerCase();
        if (lower.includes('v5')) return 'v5';
        if (lower.includes('v4_5_plus') || lower.includes('v4.5+')) return 'v4.5+';
        if (lower.includes('v4_5') || lower.includes('v4.5')) return 'v4.5';
        if (lower.includes('v4')) return 'v4';
        if (lower.includes('v3_5') || lower.includes('v3.5')) return 'v3.5';
        return rawName;
    }

    // --- Tabs ---
    const menuItems = document.querySelectorAll('.menu li');
    const sections = document.querySelectorAll('.tab-content');
    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            const tabId = item.getAttribute('data-tab');
            if (!tabId) return; 
            menuItems.forEach(i => i.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));
            item.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });

    // --- Logs ---
    const jsonOutput = document.getElementById('jsonOutput');
    document.getElementById('clearLogsBtn').addEventListener('click', () => {
        jsonOutput.innerHTML = '<div class="log-entry info">Logs cleared. Waiting for requests...</div>';
    });

    socket.on('api_log', (msg) => {
        if(jsonOutput.querySelector('.info')) jsonOutput.innerHTML = '';
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        const timestamp = new Date().toLocaleTimeString();
        let labelClass = 'req'; let labelText = 'REQUEST';
        if(msg.type === 'response') { labelClass = 'res'; labelText = 'RESPONSE'; }
        if(msg.type === 'poll') { labelClass = 'poll'; labelText = 'POLLING STATUS'; }
        entry.innerHTML = `<div class="log-timestamp">[${timestamp}]</div><span class="log-type ${labelClass}">${labelText}</span><div class="json-code">${JSON.stringify(msg.data, null, 2)}</div>`;
        jsonOutput.prepend(entry);
    });

    // --- UI Logic ---
    const customModeToggle = document.getElementById('customMode');
    const instrumentalToggle = document.getElementById('instrumental');
    const customFields = document.getElementById('customFields');
    const promptContainer = document.getElementById('promptContainer');
    const promptLabel = document.getElementById('promptLabel');
    const promptInput = document.getElementById('prompt');

    function updateUI() {
        const isCustom = customModeToggle.checked;
        const isInstrumental = instrumentalToggle.checked;
        if (isCustom) {
            customFields.classList.remove('hidden');
            if (isInstrumental) {
                promptContainer.classList.add('hidden');
            } else {
                promptContainer.classList.remove('hidden');
                promptLabel.innerText = "Lyrics"; 
                promptInput.placeholder = "[Verse 1]\nNeon lights in the rain...";
            }
        } else {
            customFields.classList.add('hidden');
            promptContainer.classList.remove('hidden');
            promptLabel.innerText = "Song Description";
            promptInput.placeholder = "A futuristic synthwave track...";
        }
    }
    if(customModeToggle && instrumentalToggle) {
        customModeToggle.addEventListener('change', updateUI);
        instrumentalToggle.addEventListener('change', updateUI);
        updateUI();
    }

    // --- Generation Logic ---
    const generateForm = document.getElementById('generateForm');
    const statusBox = document.getElementById('statusMessage');

    if(generateForm) {
        generateForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const selectedModelBtn = document.querySelector('input[name="model"]:checked');
            const modelValue = selectedModelBtn ? selectedModelBtn.value : 'V3_5';
            const promptVal = document.getElementById('prompt').value;
            const titleVal = document.getElementById('title').value || "Generated Track";
            const styleVal = document.getElementById('style').value || "AI Style";

            // 1. Создаем фейки и запоминаем их ID
            const tempIds = createFakeGeneration(modelValue, titleVal, styleVal, promptVal);
            
            // Добавляем в список ожидающих привязки TaskID
            pendingTempTracks.push(...tempIds);

            statusBox.classList.remove('hidden');
            statusBox.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Sending via Socket...';

            const payload = {
                prompt: promptVal,
                customMode: customModeToggle.checked,
                instrumental: document.getElementById('instrumental').checked,
                model: modelValue,
                callBackUrl: "https://example.com/callback" 
            };
            if(payload.customMode) {
                payload.style = styleVal;
                payload.title = titleVal;
                if(payload.instrumental) payload.prompt = ""; 
            }

            socket.emit('generate_music', payload);
        });
    }

    // --- Socket Listeners ---
    socket.on('task_created', (data) => {
        const taskId = data.taskId;
        statusBox.innerHTML = '<i class="fa-solid fa-check"></i> Task Started!';
        setTimeout(() => statusBox.classList.add('hidden'), 2000);

        // Привязываем TaskID к ожидающим трекам
        // Берем последние 2 добавленных ID (или сколько их там в pendingTempTracks)
        // Логика: берем pendingTempTracks, ищем эти ID в библиотеке и прописываем им taskId
        
        if (pendingTempTracks.length > 0) {
            library = library.map(track => {
                if (pendingTempTracks.includes(track.id)) {
                    return { ...track, taskId: taskId };
                }
                return track;
            });
            saveLibrary();
            // Очищаем список ожидающих
            pendingTempTracks = []; 
        }
    });

    socket.on('error_message', (msg) => { statusBox.innerText = 'Error: ' + msg; });

    socket.on('task_update', (data) => {
        const { taskId, status, tracks } = data;
        
        if (tracks && tracks.length > 0) {
            let needsRender = false;

            tracks.forEach((serverTrack) => {
                
                // 1. Пытаемся найти трек по его РЕАЛЬНОМУ ID (если он уже есть в базе)
                let existingIndex = library.findIndex(t => t.id === serverTrack.id);
                
                // 2. Если не нашли по реальному ID, ищем ВРЕМЕННЫЙ трек с таким же taskId
                //    Мы ищем ПЕРВЫЙ попавшийся временный трек этого задания и заменяем его.
                if (existingIndex === -1) {
                    existingIndex = library.findIndex(t => t.taskId === taskId && t.id.startsWith('temp_'));
                    
                    if (existingIndex !== -1) {
                        // ВАЖНО: Мы нашли временный трек, который нужно превратить в настоящий.
                        // Нужно остановить таймер этого временного трека!
                        const tempId = library[existingIndex].id;
                        if (progressTimers[tempId]) {
                            clearInterval(progressTimers[tempId]);
                            delete progressTimers[tempId];
                        }
                    }
                }

                // Формируем объект нового трека
                // Пытаемся сохранить модель, если сервер вдруг прислал пустое поле
                let modelToSave = serverTrack.model_name;
                if (!modelToSave && existingIndex !== -1) {
                    modelToSave = library[existingIndex].model_name;
                }

                const trackObj = {
                    id: serverTrack.id, // Теперь у трека будет реальный ID
                    taskId: taskId,
                    title: serverTrack.title || library[existingIndex]?.title || "Generating...",
                    tags: serverTrack.tags || library[existingIndex]?.tags || "",
                    imageUrl: serverTrack.imageUrl || 'https://placehold.co/100/18181b/ffffff?text=Loading',
                    audioUrl: serverTrack.audioUrl || '',
                    duration: serverTrack.duration || 0,
                    status: (status === 'SUCCESS') ? 'complete' : 'generating',
                    model_name: modelToSave || 'AI',
                    lyrics: serverTrack.prompt || ""
                };

                if (existingIndex !== -1) {
                    // Заменяем старый/временный трек на новый
                    library[existingIndex] = { ...library[existingIndex], ...trackObj };
                    needsRender = true;
                } else {
                    // Если это какой-то совсем новый трек (не нашли пару), добавляем
                    library.unshift(trackObj);
                    needsRender = true;
                }
            });

            if (needsRender) {
                saveLibrary();
                renderLibrary();
            }
        }
    });

    // --- Helper Functions ---
    function createFakeGeneration(model, title, tags, lyrics) {
        const now = new Date().toISOString();
        const id1 = 'temp_' + Date.now() + '_1';
        const id2 = 'temp_' + Date.now() + '_2';
        
        // Создаем 2 плейсхолдера
        const newTracks = [
            {
                id: id1, title, tags,
                imageUrl: 'https://placehold.co/100/18181b/ffffff?text=Generating',
                audioUrl: '', model_name: model,
                status: 'generating', progress: 0, createdAt: now, lyrics: lyrics || "Lyrics generating..."
            },
            {
                id: id2, title, tags,
                imageUrl: 'https://placehold.co/100/18181b/ffffff?text=Generating',
                audioUrl: '', model_name: model,
                status: 'generating', progress: 0, createdAt: now, lyrics: lyrics || "Lyrics generating..."
            }
        ];
        
        library = [...newTracks, ...library];
        renderLibrary();
        
        simulateProgress(id1);
        simulateProgress(id2);
        
        return [id1, id2];
    }

    function simulateProgress(trackId) {
        let progress = 0;
        // Очищаем старый таймер если был (на всякий случай)
        if (progressTimers[trackId]) clearInterval(progressTimers[trackId]);

        progressTimers[trackId] = setInterval(() => {
            progress += 0.5; // Скорость прогресса
            const trackIndex = library.findIndex(t => t.id === trackId);
            
            if (trackIndex !== -1) {
                library[trackIndex].progress = progress;
                
                // Оптимизация: не перерисовываем всю библиотеку, а ищем элемент
                const card = document.querySelector(`[data-id="${trackId}"]`);
                if (card) {
                    const bar = card.querySelector('.loading-progress');
                    if (bar) bar.style.width = `${progress}%`;
                }
                
                // Если дошло до 95%, ждем ответа сервера (не завершаем сами)
                if (progress >= 95) {
                    clearInterval(progressTimers[trackId]);
                }
            } else {
                // Трек был удален или заменен на реальный -> останавливаем
                clearInterval(progressTimers[trackId]);
                delete progressTimers[trackId];
            }
        }, 1000);
    }

    // --- Render ---
    const libraryGrid = document.getElementById('libraryGrid');
    function renderLibrary() {
        libraryGrid.innerHTML = '';
        if (library.length === 0) {
            libraryGrid.innerHTML = '<div class="empty-state">No music generated yet.</div>';
            return;
        }
        library.forEach(track => {
            // Проверяем статус. Если audioUrl нет или статус не success -> generating
            const isGenerating = (track.status !== 'complete' && track.status !== 'SUCCESS') || !track.audioUrl;
            const isCurrent = track.id === currentTrackId;
            const playIcon = (isCurrent && isPlaying) ? 'fa-pause' : 'fa-play';

            const card = document.createElement('div');
            card.className = `track-card ${isGenerating ? 'generating' : ''} ${isCurrent ? 'playing' : ''}`;
            card.setAttribute('data-id', track.id);
            card.innerHTML = `
                <div class="img-container" onclick="${isGenerating ? '' : `togglePlay('${track.id}')`}">
                    <img src="${track.imageUrl}" class="track-img" alt="cover">
                    ${!isGenerating ? `<div class="play-overlay"><i class="fa-solid ${playIcon}"></i></div>` : ''}
                </div>
                
                <div class="track-info-mini">
                    <div class="title-row">
                        <div class="track-title">${track.title || 'Untitled'}</div>
                        <span class="model-tag">${getDisplayModelName(track.model_name)}</span>
                    </div>
                    <div class="track-meta">
                        ${isGenerating ? 'Generating...' : `${formatTime(track.duration || 0)} • ${track.tags || 'AI'}`}
                    </div>
                </div>

                ${!isGenerating ? `
                <div class="track-actions">
                    <button class="track-menu-btn" onclick="toggleMenu(event, '${track.id}')"><i class="fa-solid fa-ellipsis-vertical"></i></button>
                    <div class="dropdown-menu" id="menu-${track.id}">
                        <div class="dropdown-item" onclick="openLyrics('${track.id}')"><i class="fa-solid fa-align-left"></i> Lyrics</div>
                        <div class="dropdown-item delete" onclick="deleteTrack('${track.id}')"><i class="fa-solid fa-trash"></i> Delete</div>
                    </div>
                </div>` : ''}
                ${isGenerating ? `<div class="loading-progress" style="width: ${track.progress || 0}%"></div>` : ''}
            `;
            libraryGrid.appendChild(card);
        });
    }

    // --- Player & Actions ---
    window.togglePlay = function(id) {
        const track = library.find(t => t.id === id);
        if (!track) return;
        if (currentTrackId !== id) {
            loadTrack(track);
            audio.play();
            isPlaying = true;
        } else {
            if (audio.paused) { audio.play(); isPlaying = true; } 
            else { audio.pause(); isPlaying = false; }
        }
        updatePlayButtonUI();
        renderLibrary();
    };

    window.toggleMenu = function(e, id) {
        e.stopPropagation();
        document.querySelectorAll('.dropdown-menu').forEach(el => el.classList.remove('show'));
        const menu = document.getElementById(`menu-${id}`);
        if (menu) menu.classList.toggle('show');
    };
    document.addEventListener('click', () => { document.querySelectorAll('.dropdown-menu').forEach(el => el.classList.remove('show')); });

    window.deleteTrack = function(id) {
        if(confirm('Delete?')) {
            library = library.filter(t => t.id !== id);
            // Также удаляем таймер, если это был генерирующийся трек
            if(progressTimers[id]) {
                clearInterval(progressTimers[id]);
                delete progressTimers[id];
            }
            saveLibrary();
            renderLibrary();
            if (currentTrackId === id) resetPlayerUI();
        }
    };

    const modal = document.getElementById('lyricsModal');
    const closeBtn = document.getElementById('closeModalBtn');
    window.openLyrics = function(id) {
        const track = library.find(t => t.id === id);
        if(!track) return;
        document.getElementById('modalCover').src = track.imageUrl;
        document.getElementById('modalTitle').innerText = track.title;
        document.getElementById('modalTags').innerText = track.tags;
        document.getElementById('modalLyrics').innerText = track.lyrics || "No lyrics.";
        modal.classList.remove('hidden');
    };
    closeBtn.addEventListener('click', () => modal.classList.add('hidden'));

    const audio = document.getElementById('audioElement');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const progressBar = document.getElementById('progressBar');

    function loadTrack(track) {
        currentTrackId = track.id;
        document.getElementById('playerCover').src = track.imageUrl;
        document.getElementById('playerTitle').innerText = track.title || 'Untitled';
        document.getElementById('playerArtist').innerText = track.tags || 'Suno AI';
        audio.src = track.audioUrl;
    }
    function resetPlayerUI() {
        currentTrackId = null; isPlaying = false;
        document.getElementById('playerCover').src = 'https://placehold.co/60';
        document.getElementById('playerTitle').innerText = 'Select a track';
        document.getElementById('playerArtist').innerText = 'Suno AI';
        updatePlayButtonUI();
    }
    playPauseBtn.addEventListener('click', () => {
        if (!currentTrackId && library.length > 0) {
            // Ищем первый завершенный трек
            const firstReady = library.find(t => t.status === 'complete');
            if(firstReady) window.togglePlay(firstReady.id);
            return;
        }
        if (currentTrackId) window.togglePlay(currentTrackId);
    });
    function updatePlayButtonUI() {
        playPauseBtn.innerHTML = isPlaying ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
    }
    audio.addEventListener('play', () => { isPlaying = true; updatePlayButtonUI(); });
    audio.addEventListener('pause', () => { isPlaying = false; updatePlayButtonUI(); renderLibrary(); });
    audio.addEventListener('ended', () => { isPlaying = false; updatePlayButtonUI(); renderLibrary(); });
    audio.addEventListener('timeupdate', () => {
        if (!audio.duration) return;
        const pct = (audio.currentTime / audio.duration) * 100;
        progressBar.value = pct || 0;
        progressBar.style.setProperty('--seek-before-width', `${pct}%`);
        document.getElementById('currentTime').innerText = formatTime(audio.currentTime);
        document.getElementById('duration').innerText = formatTime(audio.duration || 0);
    });
    progressBar.addEventListener('input', (e) => {
        if (!audio.duration) return;
        audio.currentTime = (e.target.value / 100) * audio.duration;
        progressBar.style.setProperty('--seek-before-width', `${e.target.value}%`);
    });
    function formatTime(s) {
        const m = Math.floor(s / 60); const sc = Math.floor(s % 60);
        return `${m}:${sc < 10 ? '0' : ''}${sc}`;
    }

    loadLibrary();
});