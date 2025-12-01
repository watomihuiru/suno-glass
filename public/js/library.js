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
                    <div class="dropdown-item" onclick="prepareCover('${track.id}')"><i class="fa-solid fa-record-vinyl"></i> Create Cover</div>
                    <div class="dropdown-item" onclick="prepareExtend('${track.id}')"><i class="fa-solid fa-arrows-left-right-to-line"></i> Extend</div>
                    <div class="dropdown-item" onclick="downloadTrack('${track.id}')"><i class="fa-solid fa-download"></i> Download</div>
                    <div class="dropdown-item delete" onclick="deleteTrack('${track.id}')"><i class="fa-solid fa-trash"></i> Delete</div>
                </div>
            </div>` : ''}
            ${isGenerating ? `<div class="loading-progress" style="width: ${track.progress || 0}%"></div>` : ''}
        `;
        libraryGrid.appendChild(card);
    });
}

// Global actions
window.togglePlay = function(id) {
    const track = library.find(t => t.id === id); if(!track) return;
    
    // Останавливаем extend плеер при запуске основного плеера
    if (window.extendAudioPlayer && !window.extendAudioPlayer.paused) {
        window.extendAudioPlayer.pause();
        window.updatePlayButton(false);
    }
    
    if(currentTrackId!==id){ loadTrack(track); audio.play(); isPlaying=true; } else { if(audio.paused){audio.play(); isPlaying=true;} else{audio.pause(); isPlaying=false;} }
    updatePlayButtonUI(); renderLibrary();
};
window.toggleMenu = function(e, id) { 
    e.stopPropagation(); 
    document.querySelectorAll('.dropdown-menu').forEach(el => el.classList.remove('show'));
    document.querySelectorAll('.track-card').forEach(el => el.style.zIndex = '');
    
    const menu = document.getElementById(`menu-${id}`); 
    const trackCard = document.querySelector(`[data-id="${id}"]`);
    
    if(menu) {
        menu.classList.toggle('show'); 
        if (menu.classList.contains('show')) {
            trackCard.style.zIndex = '100';
        }
    }
};
document.addEventListener('click', () => { 
    document.querySelectorAll('.dropdown-menu').forEach(el => el.classList.remove('show')); 
    document.querySelectorAll('.track-card').forEach(el => el.style.zIndex = '');
});

window.deleteTrack = function(id) { if(confirm('Delete?')){ library = library.filter(t => t.id !== id); if(progressTimers[id]) clearInterval(progressTimers[id]); saveLibrary(); renderLibrary(); if(currentTrackId===id) resetPlayerUI(); } };
window.prepareCover = function(id) {
    const track = library.find(t => t.id === id); if (!track || !track.audioUrl) { alert("Audio URL is missing."); return; }
    document.querySelector('[data-tab="cover"]').click();
    if (window.coverFormHandler) {
        window.coverFormHandler.resetFile();
    }
    const coverAudioUrlInput = document.getElementById('coverAudioUrl');
    coverAudioUrlInput.value = track.audioUrl;
    document.getElementById('uploadContent').classList.add('hidden');
    document.getElementById('filePreview').classList.add('hidden');
    document.getElementById('trackPreview').classList.remove('hidden');
    document.getElementById('trackPreviewImg').src = track.imageUrl;
    document.getElementById('trackPreviewTitle').innerText = track.title;
};
window.prepareExtend = function(id) {
    const track = library.find(t => t.id === id); if (!track || !track.audioUrl) { alert("Audio URL is missing."); return; }
    document.querySelector('[data-tab="extend"]').click();
    if (window.extendFormHandler) {
        window.extendFormHandler.resetFile();
    }
    const extendAudioUrlInput = document.getElementById('extendAudioUrl');
    extendAudioUrlInput.value = track.audioUrl;
    document.getElementById('extendUploadContent').classList.add('hidden');
    document.getElementById('extendFilePreview').classList.add('hidden');
    document.getElementById('extendTrackPreview').classList.remove('hidden');
    document.getElementById('extendTrackPreviewImg').src = track.imageUrl;
    document.getElementById('extendTrackPreviewTitle').innerText = track.title;
    
    // Initialize extend audio player and waveform
    initExtendAudio(track.audioUrl);
};
window.downloadTrack = function(id) {
    const track = library.find(t => t.id === id); 
    if (!track || !track.audioUrl) {
        logApi({
            type: 'error',
            msg: 'Cannot download: track or audio URL missing',
            timestamp: new Date().toISOString()
        });
        return;
    }

    // Request download URL from server
    socket.emit('get_download_url', { 
        fileUrl: track.audioUrl, 
        trackId: id 
    });

    // Show loading state
    const menu = document.getElementById(`menu-${id}`);
    if (menu) {
        const downloadItem = menu.querySelector('.dropdown-item:nth-child(4)');
        if (downloadItem) {
            downloadItem.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Preparing...';
            downloadItem.style.pointerEvents = 'none';
        }
    }

    // Log download request
    logApi({
        type: 'info',
        msg: `Download requested for track: ${track.title}`,
        timestamp: new Date().toISOString()
    });
};

const modal = document.getElementById('lyricsModal'); const closeBtn = document.getElementById('closeModalBtn');
window.openLyrics = function(id) {
    const track = library.find(t => t.id === id); if(!track) return;
    document.getElementById('modalCover').src = track.imageUrl; document.getElementById('modalTitle').innerText = track.title; document.getElementById('modalTags').innerText = track.tags; document.getElementById('modalLyrics').innerText = track.lyrics || "No lyrics.";
    modal.classList.remove('hidden');
};
closeBtn.addEventListener('click', () => modal.classList.add('hidden'));