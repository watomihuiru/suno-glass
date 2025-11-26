// --- GENERATE FORM ---
const generateForm = document.getElementById('generateForm');

if (generateForm) {
    generateForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const formData = new FormData(generateForm);
        const modelVal = formData.get('model'); 

        // Если вдруг модели нет, тихо выходим или ставим дефолт, но без спама в консоль
        if (!modelVal) return;

        const promptVal = document.getElementById('prompt').value;
        const titleVal = document.getElementById('title').value || "Generated Track";
        const styleVal = document.getElementById('style').value || "AI Style";
        
        const customModeChecked = document.querySelector('input[name="customMode"]:checked');
        const instrumentalChecked = document.querySelector('input[name="instrumental"]:checked');
        const isCustom = customModeChecked && customModeChecked.value === 'true';
        const isInstrumental = instrumentalChecked && instrumentalChecked.value === 'true';

        const tempIds = createFakeGeneration(modelVal, titleVal, styleVal, promptVal);
        pendingTempTracks.push(...tempIds);

        const payload = {
            prompt: promptVal,
            customMode: isCustom,
            instrumental: isInstrumental,
            model: modelVal,
            callBackUrl: "https://example.com/callback"
        };

        const negTags = document.getElementById('negativeTags').value;
        if (negTags) payload.negativeTags = negTags;

        const sw = document.getElementById('genStyleWeight');
        if (sw && sw.dataset.touched === "true") payload.styleWeight = parseFloat(sw.value);

        const aw = document.getElementById('genAudioWeight');
        if (aw && aw.dataset.touched === "true") payload.audioWeight = parseFloat(aw.value);

        const wd = document.getElementById('genWeirdness');
        if (wd && wd.dataset.touched === "true") payload.weirdnessConstraint = parseFloat(wd.value);

        if (isCustom) {
            payload.style = styleVal;
            payload.title = titleVal;

            if (!isInstrumental) {
                const gender = document.getElementById('vocalGender').value;
                if (gender) payload.vocalGender = gender;
            }
        }

        socket.emit('generate_music', payload);
    });
}

// --- COVER / UPLOAD LOGIC ---
const uploadZone = document.getElementById('uploadZone');
const coverFileInput = document.getElementById('coverFileInput');
const uploadContent = document.getElementById('uploadContent');
const filePreview = document.getElementById('filePreview');
const removeFileBtn = document.getElementById('removeFileBtn');
const trackPreview = document.getElementById('trackPreview');
const removeTrackBtn = document.getElementById('removeTrackBtn');
const coverAudioUrlInput = document.getElementById('coverAudioUrl');
let coverFile = null;

if (uploadZone) {
    uploadZone.addEventListener('click', () => {
        if (!coverAudioUrlInput.value) coverFileInput.click();
    });
    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });
    uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });
}

if (coverFileInput) {
    coverFileInput.addEventListener('change', () => {
        if (coverFileInput.files.length) handleFile(coverFileInput.files[0]);
    });
}

if (removeFileBtn) {
    removeFileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        resetFile();
    });
}

if (removeTrackBtn) {
    removeTrackBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        coverAudioUrlInput.value = '';
        trackPreview.classList.add('hidden');
        uploadContent.classList.remove('hidden');
    });
}

function handleFile(file) {
    if (file.size > 10 * 1024 * 1024) return; // Silent fail or custom UI logic, removed alert as requested implicit cleanup
    if (!file.type.startsWith('audio/')) return;

    coverAudioUrlInput.value = '';
    trackPreview.classList.add('hidden');
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

// --- COVER FORM SUBMIT ---
const coverForm = document.getElementById('coverForm');
if (coverForm) {
    coverForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const formData = new FormData(coverForm);
        const hasUrl = !!coverAudioUrlInput.value;

        if (!hasUrl) return; 

        const modelVal = formData.get('coverModel');
        if (!modelVal) return;

        const promptVal = document.getElementById('coverPrompt').value;
        const titleVal = document.getElementById('coverTitle').value || "Cover Track";
        const styleVal = document.getElementById('coverStyle').value || "New Style";
        const coverCustomModeChecked = document.querySelector('input[name="coverCustomMode"]:checked');
        const coverInstrumentalChecked = document.querySelector('input[name="coverInstrumental"]:checked');
        const isCustom = coverCustomModeChecked && coverCustomModeChecked.value === 'true';
        const isInstrumental = coverInstrumentalChecked && coverInstrumentalChecked.value === 'true';

        const tempIds = createFakeGeneration(modelVal, titleVal, styleVal, promptVal);
        pendingTempTracks.push(...tempIds);

        const payload = {
            uploadUrl: coverAudioUrlInput.value,
            customMode: isCustom,
            instrumental: isInstrumental,
            model: modelVal,
            prompt: promptVal,
            callBackUrl: "https://example.com/callback",
        };

        const negTags = document.getElementById('coverNegativeTags').value;
        if (negTags) payload.negativeTags = negTags;

        const sw = document.getElementById('styleWeight');
        if (sw && sw.dataset.touched === "true") payload.styleWeight = parseFloat(sw.value);

        const aw = document.getElementById('audioWeight');
        if (aw && aw.dataset.touched === "true") payload.audioWeight = parseFloat(aw.value);

        const wd = document.getElementById('weirdness');
        if (wd && wd.dataset.touched === "true") payload.weirdnessConstraint = parseFloat(wd.value);

        if (isCustom) {
            payload.style = styleVal;
            payload.title = titleVal;
            if (!isInstrumental) {
                const gender = document.getElementById('coverVocalGender').value;
                if (gender) payload.vocalGender = gender;
            }
        }

        socket.emit('generate_cover', payload);
    });
}

// --- EXTEND / UPLOAD LOGIC ---
const extendUploadZone = document.getElementById('extendUploadZone');
const extendFileInput = document.getElementById('extendFileInput');
const extendUploadContent = document.getElementById('extendUploadContent');
const extendFilePreview = document.getElementById('extendFilePreview');
const extendRemoveFileBtn = document.getElementById('extendRemoveFileBtn');
const extendTrackPreview = document.getElementById('extendTrackPreview');
const extendRemoveTrackBtn = document.getElementById('extendRemoveTrackBtn');
const extendAudioUrlInput = document.getElementById('extendAudioUrl');
let extendFile = null;

if (extendUploadZone) {
    extendUploadZone.addEventListener('click', () => {
        if (!extendAudioUrlInput.value) extendFileInput.click();
    });
    extendUploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        extendUploadZone.classList.add('dragover');
    });
    extendUploadZone.addEventListener('dragleave', () => extendUploadZone.classList.remove('dragover'));
    extendUploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        extendUploadZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) handleExtendFile(e.dataTransfer.files[0]);
    });
}

if (extendFileInput) {
    extendFileInput.addEventListener('change', () => {
        if (extendFileInput.files.length) handleExtendFile(extendFileInput.files[0]);
    });
}

if (extendRemoveFileBtn) {
    extendRemoveFileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        resetExtendFile();
    });
}

if (extendRemoveTrackBtn) {
    extendRemoveTrackBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        extendAudioUrlInput.value = '';
        if (extendAudioPlayer) {
            extendAudioPlayer.pause();
            extendAudioPlayer.src = '';
        }
        extendTrackPreview.classList.add('hidden');
        extendUploadContent.classList.remove('hidden');
    });
}

function handleExtendFile(file) {
    if (file.size > 10 * 1024 * 1024) return;
    if (!file.type.startsWith('audio/')) return;

    extendAudioUrlInput.value = '';
    extendTrackPreview.classList.add('hidden');
    extendFile = file;
    extendUploadContent.classList.add('hidden');
    extendFilePreview.classList.remove('hidden');
    extendFilePreview.querySelector('.file-name').innerText = file.name;
    extendFilePreview.querySelector('.file-size').innerText = (file.size / 1024 / 1024).toFixed(2) + ' MB';
}

function resetExtendFile() {
    extendFile = null;
    extendFileInput.value = '';
    extendUploadContent.classList.remove('hidden');
    extendFilePreview.classList.add('hidden');
    if (extendAudioPlayer) {
        extendAudioPlayer.pause();
        extendAudioPlayer.src = '';
    }
    if (extendTrackPreview) {
        extendTrackPreview.classList.add('hidden');
    }
}

// --- EXTEND AUDIO PLAYER & WAVEFORM ---
let extendAudioPlayer = null;
let extendWaveformCanvas = null;
let extendWaveformCtx = null;
let extendSelectionPercent = 0;
let isDraggingExtend = false;

function initExtendAudio(audioUrl) {
    extendAudioPlayer = document.getElementById('extendAudioPlayer');
    extendWaveformCanvas = document.getElementById('extendWaveform');
    if (!extendAudioPlayer || !extendWaveformCanvas) return;
    
    extendWaveformCtx = extendWaveformCanvas.getContext('2d');
    extendAudioPlayer.src = audioUrl;
    
    extendAudioPlayer.addEventListener('loadedmetadata', () => {
        drawWaveform();
        updateExtendTime(0);
    });
    
    extendAudioPlayer.addEventListener('timeupdate', () => {
        if (!isDraggingExtend) {
            const percent = (extendAudioPlayer.currentTime / extendAudioPlayer.duration) * 100;
            if (percent <= extendSelectionPercent) {
                updateSelectionHandle(percent);
            }
        }
    });
    
    // Waveform interaction
    extendWaveformCanvas.addEventListener('click', (e) => {
        const rect = extendWaveformCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percent = (x / rect.width) * 100;
        updateSelectionHandle(Math.max(0, Math.min(100, percent)));
    });
    
    // Drag handle
    const handle = document.getElementById('extendSelectionHandle');
    if (handle) {
        handle.addEventListener('mousedown', startDrag);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', stopDrag);
    }
}

async function drawWaveform() {
    if (!extendAudioPlayer || !extendWaveformCanvas || !extendWaveformCtx) return;
    
    const width = extendWaveformCanvas.offsetWidth;
    const height = extendWaveformCanvas.offsetHeight;
    extendWaveformCanvas.width = width;
    extendWaveformCanvas.height = height;
    
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const response = await fetch(extendAudioPlayer.src);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        const channelData = audioBuffer.getChannelData(0);
        const samples = 200;
        const blockSize = Math.floor(channelData.length / samples);
        const data = [];
        
        for (let i = 0; i < samples; i++) {
            let sum = 0;
            for (let j = 0; j < blockSize; j++) {
                sum += Math.abs(channelData[i * blockSize + j]);
            }
            data.push(sum / blockSize);
        }
        
        const max = Math.max(...data);
        const barWidth = width / samples;
        const barGap = 1;
        const selectedBars = Math.floor((extendSelectionPercent / 100) * samples);
        
        // Draw unselected part (gray)
        extendWaveformCtx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        for (let i = selectedBars; i < samples; i++) {
            const barHeight = (data[i] / max) * height * 0.8;
            const x = i * barWidth;
            const y = height - barHeight;
            extendWaveformCtx.fillRect(x, y, barWidth - barGap, barHeight);
        }
        
        // Draw selected part (pink)
        extendWaveformCtx.fillStyle = '#ec4899';
        for (let i = 0; i < selectedBars; i++) {
            const barHeight = (data[i] / max) * height * 0.8;
            const x = i * barWidth;
            const y = height - barHeight;
            extendWaveformCtx.fillRect(x, y, barWidth - barGap, barHeight);
        }
        
        // Update selection handle position (without redrawing)
        const handle = document.getElementById('extendSelectionHandle');
        const overlay = document.getElementById('extendSelectionOverlay');
        if (handle && overlay && extendAudioPlayer) {
            const containerWidth = extendWaveformCanvas.offsetWidth;
            const handlePosition = (extendSelectionPercent / 100) * containerWidth;
            handle.style.left = handlePosition + 'px';
            overlay.style.width = handlePosition + 'px';
        }
    } catch (error) {
        console.error('Error drawing waveform:', error);
        // Fallback to simple visualization
        const bars = 100;
        const barWidth = width / bars;
        const barGap = 2;
        const selectedBars = Math.floor((extendSelectionPercent / 100) * bars);
        
        // Draw unselected part (gray)
        extendWaveformCtx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        for (let i = selectedBars; i < bars; i++) {
            const barHeight = Math.random() * 0.6 + 0.2;
            const x = i * barWidth;
            const y = height - (barHeight * height);
            extendWaveformCtx.fillRect(x, y, barWidth - barGap, barHeight * height);
        }
        
        // Draw selected part (pink)
        extendWaveformCtx.fillStyle = '#ec4899';
        for (let i = 0; i < selectedBars; i++) {
            const barHeight = Math.random() * 0.6 + 0.2;
            const x = i * barWidth;
            const y = height - (barHeight * height);
            extendWaveformCtx.fillRect(x, y, barWidth - barGap, barHeight * height);
        }
        updateSelectionHandle(extendSelectionPercent);
    }
}

function updateSelectionHandle(percent) {
    extendSelectionPercent = Math.max(0, Math.min(100, percent));
    const handle = document.getElementById('extendSelectionHandle');
    const overlay = document.getElementById('extendSelectionOverlay');
    const container = document.getElementById('extendWaveform');
    
    if (!handle || !overlay || !container || !extendAudioPlayer) return;
    
    const containerWidth = container.offsetWidth;
    const handlePosition = (extendSelectionPercent / 100) * containerWidth;
    
    handle.style.left = handlePosition + 'px';
    overlay.style.width = handlePosition + 'px';
    
    // Update time display and continueAt field
    const time = (extendSelectionPercent / 100) * extendAudioPlayer.duration;
    updateExtendTime(time);
    
    const continueAtInput = document.getElementById('continueAt');
    if (continueAtInput) {
        continueAtInput.value = time.toFixed(1);
    }
}

function updateExtendTime(seconds) {
    const timeLabel = document.getElementById('extendTimeValue');
    if (timeLabel) {
        timeLabel.textContent = formatTime(seconds);
    }
}

function startDrag(e) {
    isDraggingExtend = true;
    e.preventDefault();
}

function drag(e) {
    if (!isDraggingExtend) return;
    const container = document.getElementById('extendWaveform');
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = (x / rect.width) * 100;
    updateSelectionHandle(Math.max(0, Math.min(100, percent)));
}

function stopDrag() {
    isDraggingExtend = false;
}

window.playExtendTrack = function() {
    if (!extendAudioPlayer) return;
    if (extendAudioPlayer.paused) {
        extendAudioPlayer.play();
    } else {
        extendAudioPlayer.pause();
    }
};

// --- EXTEND FORM SUBMIT ---
const extendForm = document.getElementById('extendForm');
if (extendForm) {
    extendForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const formData = new FormData(extendForm);
        const hasUrl = !!extendAudioUrlInput.value;

        if (!hasUrl) return;

        const modelVal = formData.get('extendModel');
        if (!modelVal) return;

        const promptVal = document.getElementById('extendPrompt').value;
        const titleVal = document.getElementById('extendTitle').value || "Extended Track";
        const styleVal = document.getElementById('extendStyle').value || "Original Style";
        const continueAtVal = document.getElementById('continueAt').value;
        const extendCustomModeChecked = document.querySelector('input[name="extendCustomMode"]:checked');
        const extendInstrumentalChecked = document.querySelector('input[name="extendInstrumental"]:checked');
        const isCustom = extendCustomModeChecked && extendCustomModeChecked.value === 'true';
        const isInstrumental = extendInstrumentalChecked && extendInstrumentalChecked.value === 'true';

        const tempIds = createFakeGeneration(modelVal, titleVal, styleVal, promptVal);
        pendingTempTracks.push(...tempIds);

        const payload = {
            uploadUrl: extendAudioUrlInput.value,
            defaultParamFlag: isCustom,
            instrumental: isInstrumental,
            model: modelVal,
            callBackUrl: "https://example.com/callback",
        };

        if (isCustom) {
            payload.style = styleVal;
            payload.title = titleVal;
            if (continueAtVal) {
                payload.continueAt = parseFloat(continueAtVal);
            } else {
                // Если continueAt не указан, используем 0 как дефолт
                payload.continueAt = 0;
            }
            if (!isInstrumental && promptVal) payload.prompt = promptVal;
        }

        const negTags = document.getElementById('extendNegativeTags').value;
        if (negTags) payload.negativeTags = negTags;

        const sw = document.getElementById('extendStyleWeight');
        if (sw && sw.dataset.touched === "true") payload.styleWeight = parseFloat(sw.value);

        const aw = document.getElementById('extendAudioWeight');
        if (aw && aw.dataset.touched === "true") payload.audioWeight = parseFloat(aw.value);

        const wd = document.getElementById('extendWeirdness');
        if (wd && wd.dataset.touched === "true") payload.weirdnessConstraint = parseFloat(wd.value);

        if (isCustom && !isInstrumental) {
            const gender = document.getElementById('extendVocalGender').value;
            if (gender) payload.vocalGender = gender;
        }

        socket.emit('generate_extend', payload);
    });
}