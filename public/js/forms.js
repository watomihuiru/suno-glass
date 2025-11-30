// --- GENERATE FORM ---
const generateForm = document.getElementById('generateForm');

const DEFAULT_MODEL_LIMITS = { prompt: 500, style: 200 };
const NON_CUSTOM_PROMPT_LIMIT = 500;

function getModelLimits(modelKey) {
    if (typeof MODEL_LIMITS === 'object' && MODEL_LIMITS !== null) {
        return MODEL_LIMITS[modelKey] || MODEL_LIMITS['V3_5'] || DEFAULT_MODEL_LIMITS;
    }
    return DEFAULT_MODEL_LIMITS;
}

function reportGenerateError(message) {
    if (!message) return;
    if (typeof logApi === 'function') {
        logApi({ type: 'error', msg: message });
    } else {
        console.warn('[GenerateForm]', message);
    }
}

function reportCoverError(message) {
    if (!message) return;
    if (typeof logApi === 'function') {
        logApi({ type: 'error', msg: message });
    } else {
        console.warn('[CoverForm]', message);
    }
}

function reportExtendError(message) {
    if (!message) return;
    if (typeof logApi === 'function') {
        logApi({ type: 'error', msg: message });
    } else {
        console.warn('[ExtendForm]', message);
    }
}

if (generateForm) {
    generateForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const formData = new FormData(generateForm);
        const modelVal = formData.get('model'); 

        if (!modelVal) {
            reportGenerateError('Please select a model before generating.');
            return;
        }

        const promptField = document.getElementById('prompt');
        const titleField = document.getElementById('title');
        const styleField = document.getElementById('style');
        const promptVal = promptField ? promptField.value.trim() : '';
        const titleVal = titleField ? titleField.value.trim() : '';
        const styleVal = styleField ? styleField.value.trim() : '';
        const limits = getModelLimits(modelVal);
        const errors = [];
        const MAX_TITLE_LEN = 80;

        const customModeChecked = document.querySelector('input[name="customMode"]:checked');
        const instrumentalChecked = document.querySelector('input[name="instrumental"]:checked');
        const isCustom = customModeChecked && customModeChecked.value === 'true';
        const isInstrumental = instrumentalChecked && instrumentalChecked.value === 'true';

        if (!isCustom && !promptVal) {
            errors.push('Song description is required in simple mode.');
        }

        if (promptVal && promptVal.length > limits.prompt) {
            errors.push(`Prompt exceeds ${limits.prompt} characters for the selected model.`);
        }

        if (isCustom) {
            if (!titleVal) {
                errors.push('Title is required in Custom Mode.');
            } else if (titleVal.length > MAX_TITLE_LEN) {
                errors.push('Title must be 80 characters or less.');
            }

            if (!styleVal) {
                errors.push('Style is required in Custom Mode.');
            } else if (styleVal.length > limits.style) {
                errors.push(`Style exceeds ${limits.style} characters for the selected model.`);
            }

            if (!isInstrumental && !promptVal) {
                errors.push('Lyrics are required when vocals are enabled in Custom Mode.');
            }
        }

        if (errors.length > 0) {
            reportGenerateError(errors[0]);
            return;
        }

        const displayTitle = titleVal || "Generated Track";
        const displayStyle = styleVal || "AI Style";
        const displayPrompt = promptVal || "Processing...";

        const tempIds = createFakeGeneration(modelVal, displayTitle, displayStyle, displayPrompt);
        pendingTempTracks.push(...tempIds);

        const payload = {
            customMode: isCustom,
            instrumental: isInstrumental,
            model: modelVal,
            callBackUrl: "https://example.com/callback"
        };

        if (!isCustom || !isInstrumental) {
            payload.prompt = promptVal;
        } else if (promptVal) {
            payload.prompt = promptVal;
        }

        if (isCustom) {
            payload.style = styleVal;
            payload.title = titleVal;
        }

        const negTagsField = document.getElementById('negativeTags');
        const negTags = negTagsField ? negTagsField.value.trim() : '';
        if (negTags) payload.negativeTags = negTags;

        const sw = document.getElementById('genStyleWeight');
        if (sw && sw.dataset.touched === "true") payload.styleWeight = parseFloat(sw.value);

        const aw = document.getElementById('genAudioWeight');
        if (aw && aw.dataset.touched === "true") payload.audioWeight = parseFloat(aw.value);

        const wd = document.getElementById('genWeirdness');
        if (wd && wd.dataset.touched === "true") payload.weirdnessConstraint = parseFloat(wd.value);

        if (isCustom && !isInstrumental) {
            const genderField = document.getElementById('vocalGender');
            const gender = genderField ? genderField.value : '';
            if (gender) payload.vocalGender = gender;
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
        const uploadUrl = coverAudioUrlInput.value ? coverAudioUrlInput.value.trim() : '';

        if (!uploadUrl) {
            reportCoverError('Please provide an audio URL before creating a cover.');
            return;
        }

        const modelVal = formData.get('coverModel');
        if (!modelVal) {
            reportCoverError('Select a model before submitting a cover task.');
            return;
        }

        const promptField = document.getElementById('coverPrompt');
        const titleField = document.getElementById('coverTitle');
        const styleField = document.getElementById('coverStyle');
        const promptVal = promptField ? promptField.value.trim() : '';
        const titleVal = titleField ? titleField.value.trim() : '';
        const styleVal = styleField ? styleField.value.trim() : '';
        const limits = getModelLimits(modelVal);
        const errors = [];
        const coverTitleMax = (modelVal === 'V5' || modelVal === 'V4_5' || modelVal === 'V4_5PLUS') ? 100 : 80;
        const customPromptLimit = limits.prompt;
        const promptLimit = document.querySelector('input[name="coverCustomMode"]:checked')?.value === 'true'
            ? customPromptLimit
            : Math.min(customPromptLimit, NON_CUSTOM_PROMPT_LIMIT);

        const coverCustomModeChecked = document.querySelector('input[name="coverCustomMode"]:checked');
        const coverInstrumentalChecked = document.querySelector('input[name="coverInstrumental"]:checked');
        const isCustom = coverCustomModeChecked && coverCustomModeChecked.value === 'true';
        const isInstrumental = coverInstrumentalChecked && coverInstrumentalChecked.value === 'true';

        if (!isCustom && !promptVal) {
            errors.push('Song description is required in simple mode.');
        }

        if (promptVal && promptVal.length > promptLimit) {
            errors.push(`Prompt exceeds ${promptLimit} characters for the selected configuration.`);
        }

        if (isCustom) {
            if (!titleVal) {
                errors.push('Title is required in Custom Mode.');
            } else if (titleVal.length > coverTitleMax) {
                errors.push(`Title must be ${coverTitleMax} characters or less for the selected model.`);
            }

            if (!styleVal) {
                errors.push('Style is required in Custom Mode.');
            } else if (styleVal.length > limits.style) {
                errors.push(`Style exceeds ${limits.style} characters for the selected model.`);
            }

            if (!isInstrumental && !promptVal) {
                errors.push('Lyrics are required when vocals are enabled in Custom Mode.');
            }
        }

        if (errors.length > 0) {
            reportCoverError(errors[0]);
            return;
        }

        const displayTitle = titleVal || 'Cover Track';
        const displayStyle = styleVal || 'New Style';
        const displayPrompt = promptVal || 'Processing...';

        const tempIds = createFakeGeneration(modelVal, displayTitle, displayStyle, displayPrompt);
        pendingTempTracks.push(...tempIds);

        const payload = {
            uploadUrl,
            customMode: isCustom,
            instrumental: isInstrumental,
            model: modelVal,
            callBackUrl: "https://example.com/callback",
        };

        if (!isCustom || !isInstrumental) {
            payload.prompt = promptVal;
        } else if (promptVal) {
            payload.prompt = promptVal;
        }

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
                const genderField = document.getElementById('coverVocalGender');
                const gender = genderField ? genderField.value : '';
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
        extendSelectionPercent = 0;
        waveformData = null;
        isDraggingExtend = false;
        isDraggingHandle = false;
        updatePlayButton(false);
        extendTrackPreview.classList.add('hidden');
        extendUploadContent.classList.remove('hidden');
    });
}

function handleExtendFile(file) {
    if (file.size > 10 * 1024 * 1024) return;
    if (!file.type.startsWith('audio/')) return;

    // Останавливаем основной плеер при добавлении файла через drag and drop
    if (audio && !audio.paused) {
        audio.pause();
        isPlaying = false;
        updatePlayButtonUI();
        renderLibrary();
    }

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
let isDraggingHandle = false;
let waveformData = null;

function initExtendAudio(audioUrl) {
    extendAudioPlayer = document.getElementById('extendAudioPlayer');
    extendWaveformCanvas = document.getElementById('extendWaveform');
    if (!extendAudioPlayer || !extendWaveformCanvas) return;
    
    extendWaveformCtx = extendWaveformCanvas.getContext('2d');
    extendAudioPlayer.src = audioUrl;
    extendSelectionPercent = 0;
    isDraggingExtend = false;
    isDraggingHandle = false;
    updatePlayButton(false);
    
    // Clear previous event listeners by cloning
    const newPlayer = extendAudioPlayer.cloneNode(true);
    extendAudioPlayer.parentNode.replaceChild(newPlayer, extendAudioPlayer);
    extendAudioPlayer = newPlayer;
    
    extendAudioPlayer.addEventListener('loadedmetadata', () => {
        drawWaveform();
        updateExtendTime(0);
        updateProgress();
    });
    
    extendAudioPlayer.addEventListener('timeupdate', () => {
        if (!isDraggingExtend && !isDraggingHandle) {
            updateProgress();
        }
    });
    
    extendAudioPlayer.addEventListener('play', () => {
        updatePlayButton(true);
    });
    
    extendAudioPlayer.addEventListener('pause', () => {
        updatePlayButton(false);
    });
    
    // Waveform click - seek to position
    extendWaveformCanvas.addEventListener('click', (e) => {
        if (isDraggingHandle) return;
        const rect = extendWaveformCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percent = (x / rect.width) * 100;
        seekToPosition(percent);
    });
    
    // Drag handle - change extend point (handled globally)
}

async function drawWaveform() {
    if (!extendAudioPlayer || !extendWaveformCanvas || !extendWaveformCtx) return;
    
    const width = extendWaveformCanvas.offsetWidth;
    const height = extendWaveformCanvas.offsetHeight;
    extendWaveformCanvas.width = width;
    extendWaveformCanvas.height = height;
    
    // Clear canvas first
    extendWaveformCtx.clearRect(0, 0, width, height);
    
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const response = await fetch(extendAudioPlayer.src);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        const channelData = audioBuffer.getChannelData(0);
        const samples = 200;
        const blockSize = Math.floor(channelData.length / samples);
        waveformData = [];
        
        for (let i = 0; i < samples; i++) {
            let sum = 0;
            for (let j = 0; j < blockSize; j++) {
                sum += Math.abs(channelData[i * blockSize + j]);
            }
            waveformData.push(sum / blockSize);
        }
        
        const max = Math.max(...waveformData);
        const barWidth = width / samples;
        const barGap = 1;
        
        // Draw all bars in gray
        extendWaveformCtx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        for (let i = 0; i < samples; i++) {
            const barHeight = (waveformData[i] / max) * height * 0.8;
            const x = i * barWidth;
            const y = height - barHeight;
            extendWaveformCtx.fillRect(x, y, barWidth - barGap, barHeight);
        }
        
    } catch (error) {
        console.error('Error drawing waveform:', error);
        // Fallback to simple visualization
        const bars = 100;
        const barWidth = width / bars;
        const barGap = 2;
        waveformData = [];
        
        extendWaveformCtx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        for (let i = 0; i < bars; i++) {
            const barHeight = Math.random() * 0.6 + 0.2;
            waveformData.push(barHeight);
            const x = i * barWidth;
            const y = height - (barHeight * height);
            extendWaveformCtx.fillRect(x, y, barWidth - barGap, barHeight * height);
        }
    }
}

function updateSelectionHandle(percent) {
    extendSelectionPercent = Math.max(0, Math.min(100, percent));
    const container = document.getElementById('extendWaveform');
    if (!container || !extendAudioPlayer) return;
    
    // Update time display and continueAt field
    const time = (extendSelectionPercent / 100) * extendAudioPlayer.duration;
    updateExtendTime(time);
    
    const continueAtInput = document.getElementById('continueAt');
    if (continueAtInput) {
        continueAtInput.value = time.toFixed(1);
    }
}

function redrawWaveformWithSelection() {
    if (!extendWaveformCanvas || !extendWaveformCtx || !waveformData) return;
    
    const width = extendWaveformCanvas.width;
    const height = extendWaveformCanvas.height;
    const samples = waveformData.length;
    const barWidth = width / samples;
    const barGap = 1;
    
    const progressPercent = (extendAudioPlayer && extendAudioPlayer.duration) ? (extendAudioPlayer.currentTime / extendAudioPlayer.duration) * 100 : 0;
    const playedBars = Math.floor((progressPercent / 100) * samples);
    
    // Clear canvas
    extendWaveformCtx.clearRect(0, 0, width, height);
    
    const max = Math.max(...waveformData);
    
    // Draw unplayed part (gray)
    extendWaveformCtx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    for (let i = playedBars; i < samples; i++) {
        const barHeight = (waveformData[i] / max) * height * 0.8;
        const x = i * barWidth;
        const y = height - barHeight;
        extendWaveformCtx.fillRect(x, y, barWidth - barGap, barHeight);
    }
    
    // Draw played part (accent color) - only in visualization
    extendWaveformCtx.fillStyle = '#6366f1';
    for (let i = 0; i < playedBars; i++) {
        const barHeight = (waveformData[i] / max) * height * 0.8;
        const x = i * barWidth;
        const y = height - barHeight;
        extendWaveformCtx.fillRect(x, y, barWidth - barGap, barHeight);
    }
}

function updateProgress() {
    if (!extendAudioPlayer || !extendAudioPlayer.duration) return;
    
    const progressPercent = (extendAudioPlayer.currentTime / extendAudioPlayer.duration) * 100;
    
    // Only redraw waveform visualization, no overlay
    if (extendWaveformCanvas && extendWaveformCtx && waveformData) {
        const width = extendWaveformCanvas.width;
        const height = extendWaveformCanvas.height;
        const samples = waveformData.length;
        const barWidth = width / samples;
        const barGap = 1;
        const playedBars = Math.floor((progressPercent / 100) * samples);
        
        // Clear canvas
        extendWaveformCtx.clearRect(0, 0, width, height);
        
        const max = Math.max(...waveformData);
        
        // Draw unplayed part (gray)
        extendWaveformCtx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        for (let i = playedBars; i < samples; i++) {
            const barHeight = (waveformData[i] / max) * height * 0.8;
            const x = i * barWidth;
            const y = height - barHeight;
            extendWaveformCtx.fillRect(x, y, barWidth - barGap, barHeight);
        }
        
        // Draw played part (accent color) - only in visualization
        extendWaveformCtx.fillStyle = '#6366f1';
        for (let i = 0; i < playedBars; i++) {
            const barHeight = (waveformData[i] / max) * height * 0.8;
            const x = i * barWidth;
            const y = height - barHeight;
            extendWaveformCtx.fillRect(x, y, barWidth - barGap, barHeight);
        }
    }
}

function seekToPosition(percent) {
    if (!extendAudioPlayer || !extendAudioPlayer.duration) return;
    const time = (percent / 100) * extendAudioPlayer.duration;
    extendAudioPlayer.currentTime = time;
    updateProgress();
}

function updateExtendTime(seconds) {
    const timeLabel = document.getElementById('extendTimeValue');
    if (timeLabel) {
        timeLabel.textContent = formatTime(seconds);
    }
}

function updatePlayButton(isPlaying) {
    const playBtn = document.getElementById('extendPlayBtn');
    const playIcon = document.getElementById('extendPlayIcon');
    if (playBtn && playIcon) {
        if (isPlaying) {
            playIcon.className = 'fa-solid fa-pause';
        } else {
            playIcon.className = 'fa-solid fa-play';
        }
    }
}

window.playExtendTrack = function() {
    if (!extendAudioPlayer) return;
    if (extendAudioPlayer.paused) {
        // Останавливаем основной плеер при запуске extend плеера
        if (audio && !audio.paused) {
            audio.pause();
            isPlaying = false;
            updatePlayButtonUI();
            renderLibrary();
        }
        extendAudioPlayer.play();
    } else {
        extendAudioPlayer.pause();
    }
};

// Global drag handlers for extend handle - optimized for instant response
let extendContainer = null;
let extendHandle = null;
let extendOverlay = null;
let extendTimeLabel = null;
let extendContinueAtInput = null;

function cacheExtendElements() {
    extendContainer = document.getElementById('extendWaveform');
    extendHandle = document.getElementById('extendSelectionHandle');
    extendOverlay = document.getElementById('extendSelectionOverlay');
    extendTimeLabel = document.getElementById('extendTimeValue');
    extendContinueAtInput = document.getElementById('continueAt');
}

document.addEventListener('mousedown', (e) => {
    const handle = document.getElementById('extendSelectionHandle');
    if (handle && (e.target === handle || handle.contains(e.target))) {
        e.stopPropagation();
        e.preventDefault();
        isDraggingHandle = true;
        isDraggingExtend = true;
        cacheExtendElements();
    }
});

document.addEventListener('mousemove', (e) => {
    if (isDraggingExtend && isDraggingHandle && extendContainer) {
        // Immediate update without any delays - use transform for better performance
        const rect = extendContainer.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const containerWidth = rect.width;
        const percent = Math.max(0, Math.min(100, (x / containerWidth) * 100));
        const handlePosition = (percent / 100) * containerWidth;
        
        // Update position instantly using transform for smoother movement
        if (extendHandle) {
            extendHandle.style.transform = `translateX(${handlePosition}px)`;
            extendHandle.style.left = '0';
        }
        if (extendOverlay) {
            extendOverlay.style.width = handlePosition + 'px';
        }
        
        // Update time display
        if (extendAudioPlayer && extendAudioPlayer.duration) {
            const time = (percent / 100) * extendAudioPlayer.duration;
            if (extendTimeLabel) {
                extendTimeLabel.textContent = formatTime(time);
            }
            if (extendContinueAtInput) {
                extendContinueAtInput.value = time.toFixed(1);
            }
        }
        
        extendSelectionPercent = percent;
    }
});

document.addEventListener('mouseup', () => {
    isDraggingExtend = false;
    isDraggingHandle = false;
    
    // Redraw waveform after drag ends to avoid ghosting
    if (extendWaveformCanvas && extendWaveformCtx && waveformData) {
        redrawWaveformWithSelection();
    }
    
    extendContainer = null;
    extendHandle = null;
    extendOverlay = null;
    extendTimeLabel = null;
    extendContinueAtInput = null;
});

// --- EXTEND FORM SUBMIT ---
const extendForm = document.getElementById('extendForm');
if (extendForm) {
    extendForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const formData = new FormData(extendForm);
        const uploadUrl = extendAudioUrlInput && extendAudioUrlInput.value ? extendAudioUrlInput.value.trim() : '';
        const errors = [];

        if (!uploadUrl) {
            errors.push('Please provide an audio URL before creating an extension task.');
        }

        const modelVal = formData.get('extendModel');
        if (!modelVal) {
            errors.push('Select a model before submitting an extend task.');
        }

        const promptField = document.getElementById('extendPrompt');
        const titleField = document.getElementById('extendTitle');
        const styleField = document.getElementById('extendStyle');
        const continueAtField = document.getElementById('continueAt');

        const promptVal = promptField ? promptField.value.trim() : '';
        const titleVal = titleField ? titleField.value.trim() : '';
        const styleVal = styleField ? styleField.value.trim() : '';
        let continueAtRaw = continueAtField ? continueAtField.value.trim() : '';

        const limits = modelVal ? getModelLimits(modelVal) : DEFAULT_MODEL_LIMITS;
        const extendCustomModeChecked = document.querySelector('input[name="extendCustomMode"]:checked');
        const extendInstrumentalChecked = document.querySelector('input[name="extendInstrumental"]:checked');
        const isCustom = extendCustomModeChecked && extendCustomModeChecked.value === 'true';
        const isInstrumental = extendInstrumentalChecked && extendInstrumentalChecked.value === 'true';
        const titleMax = (modelVal === 'V5' || modelVal === 'V4_5' || modelVal === 'V4_5PLUS') ? 100 : 80;
        const promptLimit = isCustom ? limits.prompt : Math.min(limits.prompt, NON_CUSTOM_PROMPT_LIMIT);

        if (!continueAtRaw && extendAudioPlayer && !Number.isNaN(extendAudioPlayer.currentTime)) {
            continueAtRaw = extendAudioPlayer.currentTime.toFixed(1);
        }

        const continueAtNum = parseFloat(continueAtRaw);
        if (!continueAtRaw || Number.isNaN(continueAtNum)) {
            errors.push('Select the extension point on the waveform before submitting.');
        } else if (continueAtNum <= 0) {
            errors.push('Continue At must be greater than 0 seconds.');
        }

        if (promptVal && promptVal.length > promptLimit) {
            errors.push(`Prompt exceeds ${promptLimit} characters for the selected configuration.`);
        }

        if (errors.length > 0) {
            reportExtendError(errors[0]);
            return;
        }

        const displayTitle = titleVal || 'Extended Track';
        const displayStyle = styleVal || 'Original Style';
        const displayPrompt = promptVal || 'Processing...';

        const tempIds = createFakeGeneration(modelVal, displayTitle, displayStyle, displayPrompt);
        pendingTempTracks.push(...tempIds);

        const payload = {
            uploadUrl,
            defaultParamFlag: isCustom,
            instrumental: isInstrumental,
            model: modelVal,
            callBackUrl: "https://example.com/callback",
            continueAt: continueAtNum
        };

        if (isCustom) {
            payload.style = styleVal;
            payload.title = titleVal;
        }

        if ((isCustom && !isInstrumental && promptVal) || (!isCustom && promptVal)) {
            payload.prompt = promptVal;
        }

        const negTagsField = document.getElementById('extendNegativeTags');
        const negTags = negTagsField ? negTagsField.value.trim() : '';
        if (negTags) payload.negativeTags = negTags;

        const sw = document.getElementById('extendStyleWeight');
        if (sw && sw.dataset.touched === "true") payload.styleWeight = parseFloat(sw.value);

        const aw = document.getElementById('extendAudioWeight');
        if (aw && aw.dataset.touched === "true") payload.audioWeight = parseFloat(aw.value);

        const wd = document.getElementById('extendWeirdness');
        if (wd && wd.dataset.touched === "true") payload.weirdnessConstraint = parseFloat(wd.value);

        if (isCustom && !isInstrumental) {
            const genderField = document.getElementById('extendVocalGender');
            const gender = genderField ? genderField.value : '';
            if (gender) payload.vocalGender = gender;
        }

        socket.emit('generate_extend', payload);
    });
}