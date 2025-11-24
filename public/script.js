document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    let library = []; 
    let currentTrackId = null; 
    let isPlaying = false;
    let progressTimers = {}; 
    let pendingTempTracks = [];
    let isShuffle = false;
    let isLoop = false;

    // --- INIT ---
    function loadLibrary() {
        const stored = localStorage.getItem('suno_library');
        if (stored) { library = JSON.parse(stored); renderLibrary(); }
    }
    function saveLibrary() { localStorage.setItem('suno_library', JSON.stringify(library)); }
    function getDisplayModelName(rawName) {
        if (!rawName) return 'AI';
        const lower = rawName.toLowerCase();
        if (lower.includes('v5')) return 'v5';
        if (lower.includes('v4_5_plus')) return 'v4.5+';
        if (lower.includes('v4_5')) return 'v4.5';
        if (lower.includes('v4')) return 'v4';
        if (lower.includes('v3_5')) return 'v3.5';
        return rawName;
    }

    // --- TABS ---
    document.querySelectorAll('.menu li').forEach(item => {
        item.addEventListener('click', () => {
            const tabId = item.getAttribute('data-tab');
            if (!tabId) return; 
            document.querySelectorAll('.menu li').forEach(i => i.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
            item.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });

    // --- LOGS ---
    const jsonOutput = document.getElementById('jsonOutput');
    document.getElementById('clearLogsBtn').addEventListener('click', () => {
        jsonOutput.innerHTML = '<div class="log-entry info">Logs cleared.</div>';
    });
    socket.on('api_log', (msg) => {
        if(jsonOutput.querySelector('.info')) jsonOutput.innerHTML = '';
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        const ts = new Date().toLocaleTimeString();
        let cls = 'req', txt = 'REQUEST';
        if(msg.type === 'response') { cls = 'res'; txt = 'RESPONSE'; }
        if(msg.type === 'poll') { cls = 'poll'; txt = 'POLLING'; }
        entry.innerHTML = `<div class="log-timestamp">[${ts}]</div><span class="log-type ${cls}">${txt}</span><div class="json-code">${JSON.stringify(msg.data, null, 2)}</div>`;
        jsonOutput.prepend(entry);
    });

    // ==========================================
    // GENERATE TAB LOGIC
    // ==========================================
    const customModeToggle = document.getElementById('customMode');
    const instrumentalToggle = document.getElementById('instrumental');
    const customFields = document.getElementById('customFields');
    const promptContainer = document.getElementById('promptContainer');
    const promptLabel = document.getElementById('promptLabel');
    const promptInput = document.getElementById('prompt');

    function updateGenUI() {
        const isCustom = customModeToggle.checked;
        const isInst = instrumentalToggle.checked;
        if (isCustom) {
            customFields.classList.remove('hidden');
            if (isInst) { promptContainer.classList.add('hidden'); } 
            else { promptContainer.classList.remove('hidden'); promptLabel.innerText = "Lyrics"; promptInput.placeholder = "[Verse 1]..."; }
        } else {
            customFields.classList.add('hidden');
            promptContainer.classList.remove('hidden'); promptLabel.innerText = "Song Description"; promptInput.placeholder = "A futuristic synthwave track...";
        }
    }
    if(customModeToggle) {
        customModeToggle.addEventListener('change', updateGenUI);
        instrumentalToggle.addEventListener('change', updateGenUI);
        updateGenUI();
    }

    const generateForm = document.getElementById('generateForm');
    const statusBox = document.getElementById('statusMessage');

    if(generateForm) {
        generateForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const modelVal = document.querySelector('input[name="model"]:checked').value;
            const promptVal = document.getElementById('prompt').value;
            const titleVal = document.getElementById('title').value || "Generated Track";
            const styleVal = document.getElementById('style').value || "AI Style";

            const tempIds = createFakeGeneration(modelVal, titleVal, styleVal, promptVal);
            pendingTempTracks.push(...tempIds);

            statusBox.classList.remove('hidden');
            statusBox.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Requesting...';

            const payload = {
                prompt: promptVal,
                customMode: customModeToggle.checked,
                instrumental: instrumentalToggle.checked,
                model: modelVal,
                callBackUrl: "https://example.com/callback" 
            };
            if(payload.customMode) {
                payload.style = styleVal; payload.title = titleVal;
                if(payload.instrumental) payload.prompt = ""; 
            }
            socket.emit('generate_music', payload);
        });
    }

    // ==========================================
    // COVER TAB LOGIC (NEW)
    // ==========================================
    const uploadZone = document.getElementById('uploadZone');
    const coverFileInput = document.getElementById('coverFileInput');
    const uploadContent = document.getElementById('uploadContent');
    const filePreview = document.getElementById('filePreview');
    const removeFileBtn = document.getElementById('removeFileBtn');
    
    let coverFile = null;

    // File Handling
    uploadZone.addEventListener('click', () => coverFileInput.click());
    uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
    uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault(); uploadZone.classList.remove('dragover');
        if(e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });
    coverFileInput.addEventListener('change', () => { if(coverFileInput.files.length) handleFile(coverFileInput.files[0]); });
    removeFileBtn.addEventListener('click', (e) => { e.stopPropagation(); resetFile(); });

    function handleFile(file) {
        if(file.size > 10 * 1024 * 1024) { alert('File too large (Max 10MB)'); return; }
        if(!file.type.startsWith('audio/')) { alert('Audio files only'); return; }
        
        coverFile = file;
        uploadContent.classList.add('hidden');
        filePreview.classList.remove('hidden');
        filePreview.querySelector('.file-name').innerText = file.name;
        filePreview.querySelector('.file-size').innerText = (file.size / 1024 / 1024).toFixed(2) + ' MB';
    }

    function resetFile() {
        coverFile = null;
        coverFileInput.value = '';
        uploadContent.classList.remove('hidden');
        filePreview.classList.add('hidden');
    }

    // Sliders Update
    ['styleWeight', 'audioWeight', 'weirdness'].forEach(id => {
        document.getElementById(id).addEventListener('input', (e) => {
            // id="valStyle" for "styleWeight"
            const labelId = 'val' + id.replace('Weight', '').replace('ness', '').replace('weird', 'Weird');
            const label = document.getElementById(labelId); 
            // Simple mapping fix
            if(id === 'styleWeight') document.getElementById('valStyle').innerText = e.target.value;
            if(id === 'audioWeight') document.getElementById('valAudio').innerText = e.target.value;
            if(id === 'weirdness') document.getElementById('valWeird').innerText = e.target.value;
        });
    });

    // Cover UI Update
    const coverCustomMode = document.getElementById('coverCustomMode');
    const coverInstrumental = document.getElementById('coverInstrumental');
    const coverCustomFields = document.getElementById('coverCustomFields');
    const coverPromptContainer = document.getElementById('coverPromptContainer');
    
    function updateCoverUI() {
        const isCustom = coverCustomMode.checked;
        const isInst = coverInstrumental.checked;
        
        if(isCustom) {
            coverCustomFields.classList.remove('hidden');
            if(isInst) coverPromptContainer.classList.add('hidden');
            else {
                coverPromptContainer.classList.remove('hidden');
                document.getElementById('coverPromptLabel').innerText = "Lyrics";
            }
        } else {
            coverCustomFields.classList.add('hidden');
            coverPromptContainer.classList.remove('hidden');
            document.getElementById('coverPromptLabel').innerText = "Song Description";
        }
    }
    coverCustomMode.addEventListener('change', updateCoverUI);
    coverInstrumental.addEventListener('change', updateCoverUI);
    updateCoverUI();

    // Cover Submit
    const coverForm = document.getElementById('coverForm');
    const coverStatus = document.getElementById('coverStatusMessage');

    if(coverForm) {
        coverForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if(!coverFile) { alert('Please upload an audio file'); return; }

            const modelVal = document.getElementById('coverModel').value;
            const promptVal = document.getElementById('coverPrompt').value;
            const titleVal = document.getElementById('coverTitle').value || "Cover Track";
            const styleVal = document.getElementById('coverStyle').value || "New Style";

            // 1. Fake Generation
            const tempIds = createFakeGeneration(modelVal, titleVal, styleVal, promptVal);
            pendingTempTracks.push(...tempIds);

            coverStatus.classList.remove('hidden');
            coverStatus.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading & Processing...';

            // 2. Construct Payload
            // NOTE: In a real app, you must upload the file first to get a URL.
            // Here we mock the URL because we don't have the upload endpoint.
            const fakeUploadUrl = "https://cdn.example.com/uploads/audio/" + coverFile.name;

            const payload = {
                uploadUrl: fakeUploadUrl, // Required by API
                customMode: coverCustomMode.checked,
                instrumental: coverInstrumental.checked,
                model: modelVal,
                prompt: promptVal,
                callBackUrl: "https://example.com/callback",
                // Optional params
                styleWeight: parseFloat(document.getElementById('styleWeight').value),
                audioWeight: parseFloat(document.getElementById('audioWeight').value),
                weirdnessConstraint: parseFloat(document.getElementById('weirdness').value)
            };

            if(payload.customMode) {
                payload.style = styleVal;
                payload.title = titleVal;
                payload.vocalGender = document.getElementById('coverVocalGender').value;
                if(payload.instrumental) payload.prompt = "";
            }

            socket.emit('generate_cover', payload);
        });
    }


    // ==========================================
    // SOCKET LISTENERS (SHARED)
    // ==========================================
    socket.on('task_created', (data) => {
        // Also handles cover task
        const statusEl = document.querySelector('.tab-content.active .status-box');
        if(statusEl) {
            statusEl.innerHTML = '<i class="fa-solid fa-check"></i> Task Started!';
            setTimeout(() => statusEl.classList.add('hidden'), 2000);
        }
        
        if (pendingTempTracks.length > 0) {
            library = library.map(track => {
                if (pendingTempTracks.includes(track.id)) return { ...track, taskId: data.taskId };
                return track;
            });
            saveLibrary();
            pendingTempTracks = [];
        }
    });

    socket.on('error_message', (msg) => { alert('Server Error: ' + msg); });

    socket.on('task_update', (data) => {
        const { taskId, status, tracks } = data;
        if (tracks && tracks.length > 0) {
            let needsRender = false;
            tracks.forEach((serverTrack) => {
                let existingIndex = library.findIndex(t => t.id === serverTrack.id);
                if (existingIndex === -1) {
                    existingIndex = library.findIndex(t => t.taskId === taskId && t.id.startsWith('temp_'));
                    if (existingIndex !== -1) {
                        const tempId = library[existingIndex].id;
                        if (progressTimers[tempId]) { clearInterval(progressTimers[tempId]); delete progressTimers[tempId]; }
                    }
                }
                
                let modelToSave = serverTrack.model_name;
                if (!modelToSave && existingIndex !== -1) modelToSave = library[existingIndex].model_name;

                const trackObj = {
                    id: serverTrack.id, taskId: taskId,
                    title: serverTrack.title || library[existingIndex]?.title || "Generating...",
                    tags: serverTrack.tags || library[existingIndex]?.tags || "",
                    imageUrl: serverTrack.imageUrl || 'https://placehold.co/100/18181b/ffffff?text=Loading',
                    audioUrl: serverTrack.audioUrl || '',
                    duration: serverTrack.duration || 0,
                    status: (status === 'SUCCESS') ? 'complete' : 'generating',
                    model_name: modelToSave || 'AI',
                    lyrics: serverTrack.prompt || ""
                };

                if (existingIndex !== -1) library[existingIndex] = { ...library[existingIndex], ...trackObj };
                else library.unshift(trackObj);
                needsRender = true;
            });
            if(needsRender) { saveLibrary(); renderLibrary(); }
        }
    });

    // --- Helpers ---
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
        simulateProgress(id1); simulateProgress(id2);
        return [id1, id2];
    }

    function simulateProgress(trackId) {
        let progress = 0;
        if (progressTimers[trackId]) clearInterval(progressTimers[trackId]);
        progressTimers[trackId] = setInterval(() => {
            progress += 0.5;
            const trackIndex = library.findIndex(t => t.id === trackId);
            if (trackIndex !== -1) {
                library[trackIndex].progress = progress;
                const card = document.querySelector(`[data-id="${trackId}"]`);
                if (card) {
                    const bar = card.querySelector('.loading-progress');
                    if (bar) bar.style.width = `${progress}%`;
                }
                if (progress >= 95) clearInterval(progressTimers[trackId]);
            } else { clearInterval(progressTimers[trackId]); delete progressTimers[trackId]; }
        }, 1000);
    }

    // --- Render & Player (Same as before) ---
    const libraryGrid = document.getElementById('libraryGrid');
    function renderLibrary() {
        libraryGrid.innerHTML = '';
        if (library.length === 0) { libraryGrid.innerHTML = '<div class="empty-state">No music generated yet.</div>'; return; }
        library.forEach(track => {
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
                    <div class="title-row"><div class="track-title">${track.title || 'Untitled'}</div><span class="model-tag">${getDisplayModelName(track.model_name)}</span></div>
                    <div class="track-meta">${isGenerating ? 'Generating...' : `${formatTime(track.duration || 0)} • ${track.tags || 'AI'}`}</div>
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

    // Player, Menu, Audio Events code remains exactly as in previous version...
    // (Omitting generic player logic to save space, assume it's pasted here from previous robust version)
    // But ensure global functions (togglePlay, deleteTrack) are attached to window.
    
    window.togglePlay = function(id) {
        const track = library.find(t => t.id === id);
        if (!track) return;
        if (currentTrackId !== id) { loadTrack(track); audio.play(); isPlaying = true; } 
        else { if (audio.paused) { audio.play(); isPlaying = true; } else { audio.pause(); isPlaying = false; } }
        updatePlayButtonUI(); renderLibrary();
    };
    window.toggleMenu = function(e, id) { e.stopPropagation(); document.querySelectorAll('.dropdown-menu').forEach(el => el.classList.remove('show')); const menu = document.getElementById(`menu-${id}`); if (menu) menu.classList.toggle('show'); };
    document.addEventListener('click', () => { document.querySelectorAll('.dropdown-menu').forEach(el => el.classList.remove('show')); });
    window.deleteTrack = function(id) { if(confirm('Delete?')) { library = library.filter(t => t.id !== id); if(progressTimers[id]) clearInterval(progressTimers[id]); saveLibrary(); renderLibrary(); if (currentTrackId === id) resetPlayerUI(); } };
    
    const modal = document.getElementById('lyricsModal');
    const closeBtn = document.getElementById('closeModalBtn');
    window.openLyrics = function(id) {
        const track = library.find(t => t.id === id); if(!track) return;
        document.getElementById('modalCover').src = track.imageUrl; document.getElementById('modalTitle').innerText = track.title; document.getElementById('modalTags').innerText = track.tags; document.getElementById('modalLyrics').innerText = track.lyrics || "No lyrics.";
        modal.classList.remove('hidden');
    };
    closeBtn.addEventListener('click', () => modal.classList.add('hidden'));

    const audio = document.getElementById('audioElement');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const progressBar = document.getElementById('progressBar');
    const shuffleBtn = document.getElementById('shuffleBtn');
    const loopBtn = document.getElementById('loopBtn');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');

    function loadTrack(track) { currentTrackId = track.id; document.getElementById('playerCover').src = track.imageUrl; document.getElementById('playerTitle').innerText = track.title || 'Untitled'; document.getElementById('playerArtist').innerText = track.tags || 'Suno AI'; audio.src = track.audioUrl; }
    function resetPlayerUI() { currentTrackId = null; isPlaying = false; document.getElementById('playerCover').src = 'https://placehold.co/60'; document.getElementById('playerTitle').innerText = 'Select a track'; document.getElementById('playerArtist').innerText = 'Suno AI'; updatePlayButtonUI(); }
    function updatePlayButtonUI() { playPauseBtn.innerHTML = isPlaying ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>'; }
    
    playPauseBtn.addEventListener('click', () => { if (!currentTrackId && library.length > 0) { const ready = library.filter(t=>t.status==='complete'); if(ready.length) window.togglePlay(ready[0].id); return; } if(currentTrackId) window.togglePlay(currentTrackId); });
    shuffleBtn.addEventListener('click', () => { isShuffle = !isShuffle; shuffleBtn.classList.toggle('active', isShuffle); });
    loopBtn.addEventListener('click', () => { isLoop = !isLoop; loopBtn.classList.toggle('active', isLoop); });

    function playNext() {
        const ready = library.filter(t => t.status === 'complete'); if(!ready.length) return;
        let idx = ready.findIndex(t => t.id === currentTrackId);
        if(isShuffle) idx = Math.floor(Math.random()*ready.length); else { idx++; if(idx>=ready.length) idx=0; }
        window.togglePlay(ready[idx].id);
    }
    function playPrev() {
        const ready = library.filter(t => t.status === 'complete'); if(!ready.length) return;
        if(audio.currentTime > 3) { audio.currentTime = 0; return; }
        let idx = ready.findIndex(t => t.id === currentTrackId);
        if(isShuffle) idx = Math.floor(Math.random()*ready.length); else { idx--; if(idx<0) idx=ready.length-1; }
        window.togglePlay(ready[idx].id);
    }
    nextBtn.addEventListener('click', playNext); prevBtn.addEventListener('click', playPrev);
    
    audio.addEventListener('play', () => { isPlaying = true; updatePlayButtonUI(); });
    audio.addEventListener('pause', () => { isPlaying = false; updatePlayButtonUI(); renderLibrary(); });
    audio.addEventListener('ended', () => { if(isLoop) { audio.currentTime=0; audio.play(); } else playNext(); });
    audio.addEventListener('timeupdate', () => {
        if (!audio.duration) return;
        const pct = (audio.currentTime / audio.duration) * 100;
        progressBar.value = pct || 0; progressBar.style.setProperty('--seek-before-width', `${pct}%`);
        document.getElementById('currentTime').innerText = formatTime(audio.currentTime);
        document.getElementById('duration').innerText = formatTime(audio.duration || 0);
    });
    progressBar.addEventListener('input', (e) => { if (!audio.duration) return; audio.currentTime = (e.target.value / 100) * audio.duration; progressBar.style.setProperty('--seek-before-width', `${e.target.value}%`); });
    function formatTime(s) { const m = Math.floor(s / 60); const sc = Math.floor(s % 60); return `${m}:${sc < 10 ? '0' : ''}${sc}`; }

    loadLibrary();
});