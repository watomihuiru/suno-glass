const audio = document.getElementById('audioElement');
const playPauseBtn = document.getElementById('playPauseBtn');
const progressBar = document.getElementById('progressBar');
const shuffleBtn = document.getElementById('shuffleBtn');
const loopBtn = document.getElementById('loopBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');

function loadTrack(track) { 
    currentTrackId = track.id; 
    document.getElementById('playerCover').src = track.imageUrl; 
    document.getElementById('playerTitle').innerText = track.title; 
    document.getElementById('playerArtist').innerText = track.tags; 
    audio.src = track.audioUrl; 
}
function resetPlayerUI() { 
    currentTrackId = null; isPlaying = false; 
    document.getElementById('playerCover').src = 'https://placehold.co/60'; 
    document.getElementById('playerTitle').innerText = 'Select a track'; 
    document.getElementById('playerArtist').innerText = 'Suno AI'; 
    updatePlayButtonUI(); 
}
function updatePlayButtonUI() { 
    playPauseBtn.innerHTML = isPlaying ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>'; 
}

playPauseBtn.addEventListener('click', () => { 
    if(!currentTrackId && library.length>0) { 
        const ready = library.filter(t=>t.status==='complete' || t.status === 'SUCCESS'); 
        if(ready.length) window.togglePlay(ready[0].id); 
        return; 
    } 
    if(currentTrackId) window.togglePlay(currentTrackId); 
});

shuffleBtn.addEventListener('click', () => { isShuffle = !isShuffle; shuffleBtn.classList.toggle('active', isShuffle); });
loopBtn.addEventListener('click', () => { isLoop = !isLoop; loopBtn.classList.toggle('active', isLoop); });

function playNext() {
    const ready = library.filter(t => t.status === 'complete' || t.status === 'SUCCESS'); if(!ready.length) return;
    let idx = ready.findIndex(t => t.id === currentTrackId);
    if(isShuffle) idx = Math.floor(Math.random()*ready.length); else { idx++; if(idx>=ready.length) idx=0; }
    window.togglePlay(ready[idx].id);
}
function playPrev() {
    const ready = library.filter(t => t.status === 'complete' || t.status === 'SUCCESS'); if(!ready.length) return;
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
    if(!audio.duration) return; 
    const pct = (audio.currentTime/audio.duration)*100; 
    progressBar.value = pct; 
    progressBar.style.setProperty('--seek-before-width', `${pct}%`); 
    document.getElementById('currentTime').innerText = formatTime(audio.currentTime); 
    document.getElementById('duration').innerText = formatTime(audio.duration); 
});
progressBar.addEventListener('input', (e) => { 
    if(!audio.duration) return; 
    audio.currentTime = (e.target.value/100)*audio.duration; 
    progressBar.style.setProperty('--seek-before-width', `${e.target.value}%`); 
});