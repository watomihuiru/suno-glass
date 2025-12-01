// Extend form handling module
class ExtendFormHandler {
    constructor() {
        this.form = document.getElementById('extendForm');
        this.extendUploadZone = document.getElementById('extendUploadZone');
        this.extendFileInput = document.getElementById('extendFileInput');
        this.extendAudioUrlInput = document.getElementById('extendAudioUrl');
        this.extendFile = null;
        
        // Audio player and waveform state
        this.extendAudioPlayer = null;
        this.extendWaveformCanvas = null;
        this.extendWaveformCtx = null;
        this.extendSelectionPercent = 0;
        this.isDraggingExtend = false;
        this.isDraggingHandle = false;
        this.waveformData = null;
        
        this.init();
    }

    init() {
        // Form submission
        if (this.form) {
            this.form.addEventListener('submit', this.handleSubmit.bind(this));
        }

        // File upload handlers
        this.setupFileUpload();
        
        // Waveform drag handlers
        this.setupWaveformDrag();
    }

    setupFileUpload() {
        if (!this.extendUploadZone) return;

        // Click to upload
        this.extendUploadZone.addEventListener('click', () => {
            if (!this.extendAudioUrlInput.value) this.extendFileInput.click();
        });

        // Drag and drop
        this.extendUploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.extendUploadZone.classList.add('dragover');
        });

        this.extendUploadZone.addEventListener('dragleave', () => {
            this.extendUploadZone.classList.remove('dragover');
        });

        this.extendUploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.extendUploadZone.classList.remove('dragover');
            if (e.dataTransfer.files.length) {
                this.handleFile(e.dataTransfer.files[0]);
            }
        });

        // File input change
        if (this.extendFileInput) {
            this.extendFileInput.addEventListener('change', () => {
                if (this.extendFileInput.files.length) {
                    this.handleFile(this.extendFileInput.files[0]);
                }
            });
        }

        // Remove file button
        const removeFileBtn = document.getElementById('extendRemoveFileBtn');
        if (removeFileBtn) {
            removeFileBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.resetFile();
            });
        }

        // Remove track button
        const removeTrackBtn = document.getElementById('extendRemoveTrackBtn');
        if (removeTrackBtn) {
            removeTrackBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.resetTrack();
            });
        }
    }

    setupWaveformDrag() {
        // Mouse down on handle
        document.addEventListener('mousedown', (e) => {
            const handle = document.getElementById('extendSelectionHandle');
            if (handle && (e.target === handle || handle.contains(e.target))) {
                e.stopPropagation();
                e.preventDefault();
                this.isDraggingHandle = true;
                this.isDraggingExtend = true;
                this.cacheExtendElements();
            }
        });

        // Mouse move
        document.addEventListener('mousemove', (e) => {
            if (this.isDraggingExtend && this.isDraggingHandle && this.extendContainer) {
                this.handleDragMove(e);
            }
        });

        // Mouse up
        document.addEventListener('mouseup', () => {
            this.isDraggingExtend = false;
            this.isDraggingHandle = false;
            
            // Redraw waveform after drag ends
            if (this.extendWaveformCanvas && this.extendWaveformCtx && this.waveformData) {
                this.redrawWaveformWithSelection();
            }
            
            this.clearCachedElements();
        });
    }

    cacheExtendElements() {
        this.extendContainer = document.getElementById('extendWaveform');
        this.extendHandle = document.getElementById('extendSelectionHandle');
        this.extendOverlay = document.getElementById('extendSelectionOverlay');
        this.extendTimeLabel = document.getElementById('extendTimeValue');
        this.extendContinueAtInput = document.getElementById('continueAt');
    }

    clearCachedElements() {
        this.extendContainer = null;
        this.extendHandle = null;
        this.extendOverlay = null;
        this.extendTimeLabel = null;
        this.extendContinueAtInput = null;
    }

    handleDragMove(e) {
        const rect = this.extendContainer.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const containerWidth = rect.width;
        const percent = Math.max(0, Math.min(100, (x / containerWidth) * 100));
        const handlePosition = (percent / 100) * containerWidth;
        
        // Update position instantly using transform
        if (this.extendHandle) {
            this.extendHandle.style.transform = `translateX(${handlePosition}px)`;
            this.extendHandle.style.left = '0';
        }
        if (this.extendOverlay) {
            this.extendOverlay.style.width = handlePosition + 'px';
        }
        
        // Update time display
        if (this.extendAudioPlayer && this.extendAudioPlayer.duration) {
            const time = (percent / 100) * this.extendAudioPlayer.duration;
            if (this.extendTimeLabel) {
                this.extendTimeLabel.textContent = formatTime(time);
            }
            if (this.extendContinueAtInput) {
                this.extendContinueAtInput.value = time.toFixed(1);
            }
        }
        
        this.extendSelectionPercent = percent;
    }

    handleFile(file) {
        const validation = AppConfig.validateFile(file);
        if (!validation.valid) {
            this.reportError(validation.error);
            return;
        }

        // Stop main player when adding file
        if (window.audio && !window.audio.paused) {
            window.audio.pause();
            window.isPlaying = false;
            window.updatePlayButtonUI();
            renderLibrary();
        }

        this.extendAudioUrlInput.value = '';
        this.hideTrackPreview();
        this.extendFile = file;
        this.showFilePreview(file);
    }

    showFilePreview(file) {
        const uploadContent = document.getElementById('extendUploadContent');
        const filePreview = document.getElementById('extendFilePreview');
        
        if (uploadContent) uploadContent.classList.add('hidden');
        if (filePreview) {
            filePreview.classList.remove('hidden');
            const fileNameElement = filePreview.querySelector('.file-name');
            const fileSizeElement = filePreview.querySelector('.file-size');
            if (fileNameElement) fileNameElement.innerText = file.name;
            if (fileSizeElement) fileSizeElement.innerText = AppConfig.formatFileSize(file.size);
        }
    }

    hideFilePreview() {
        const uploadContent = document.getElementById('extendUploadContent');
        const filePreview = document.getElementById('extendFilePreview');
        
        if (uploadContent) uploadContent.classList.remove('hidden');
        if (filePreview) filePreview.classList.add('hidden');
    }

    showTrackPreview() {
        const uploadContent = document.getElementById('extendUploadContent');
        const filePreview = document.getElementById('extendFilePreview');
        const trackPreview = document.getElementById('extendTrackPreview');
        
        if (uploadContent) uploadContent.classList.add('hidden');
        if (filePreview) filePreview.classList.add('hidden');
        if (trackPreview) trackPreview.classList.remove('hidden');
    }

    hideTrackPreview() {
        const trackPreview = document.getElementById('extendTrackPreview');
        if (trackPreview) trackPreview.classList.add('hidden');
    }

    resetFile() {
        this.extendFile = null;
        if (this.extendFileInput) this.extendFileInput.value = '';
        this.hideFilePreview();
        this.hideTrackPreview();
        this.resetAudioPlayer();
    }

    resetTrack() {
        if (this.extendAudioUrlInput) this.extendAudioUrlInput.value = '';
        this.resetAudioPlayer();
        this.hideTrackPreview();
        this.hideFilePreview();
    }

    resetAudioPlayer() {
        if (this.extendAudioPlayer) {
            this.extendAudioPlayer.pause();
            this.extendAudioPlayer.src = '';
        }
        this.extendSelectionPercent = 0;
        this.waveformData = null;
        this.isDraggingExtend = false;
        this.isDraggingHandle = false;
        this.updatePlayButton(false);
    }

    initExtendAudio(audioUrl) {
        this.extendAudioPlayer = document.getElementById('extendAudioPlayer');
        this.extendWaveformCanvas = document.getElementById('extendWaveform');
        if (!this.extendAudioPlayer || !this.extendWaveformCanvas) return;
        
        this.extendWaveformCtx = this.extendWaveformCanvas.getContext('2d');
        this.extendAudioPlayer.src = audioUrl;
        this.extendSelectionPercent = 0;
        this.isDraggingExtend = false;
        this.isDraggingHandle = false;
        this.updatePlayButton(false);
        
        // Clear previous event listeners by cloning
        const newPlayer = this.extendAudioPlayer.cloneNode(true);
        this.extendAudioPlayer.parentNode.replaceChild(newPlayer, this.extendAudioPlayer);
        this.extendAudioPlayer = newPlayer;
        
        this.extendAudioPlayer.addEventListener('loadedmetadata', () => {
            this.drawWaveform();
            this.updateExtendTime(0);
            this.updateProgress();
        });
        
        this.extendAudioPlayer.addEventListener('timeupdate', () => {
            if (!this.isDraggingExtend && !this.isDraggingHandle) {
                this.updateProgress();
            }
        });
        
        this.extendAudioPlayer.addEventListener('play', () => {
            this.updatePlayButton(true);
        });
        
        this.extendAudioPlayer.addEventListener('pause', () => {
            this.updatePlayButton(false);
        });
        
        // Waveform click - seek to position
        this.extendWaveformCanvas.addEventListener('click', (e) => {
            if (this.isDraggingHandle) return;
            const rect = this.extendWaveformCanvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percent = (x / rect.width) * 100;
            this.seekToPosition(percent);
        });
    }

    async drawWaveform() {
        if (!this.extendAudioPlayer || !this.extendWaveformCanvas || !this.extendWaveformCtx) return;
        
        const width = this.extendWaveformCanvas.offsetWidth;
        const height = this.extendWaveformCanvas.offsetHeight;
        this.extendWaveformCanvas.width = width;
        this.extendWaveformCanvas.height = height;
        
        this.extendWaveformCtx.clearRect(0, 0, width, height);
        
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const response = await fetch(this.extendAudioPlayer.src);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            
            const channelData = audioBuffer.getChannelData(0);
            const samples = 200;
            const blockSize = Math.floor(channelData.length / samples);
            this.waveformData = [];
            
            for (let i = 0; i < samples; i++) {
                let sum = 0;
                for (let j = 0; j < blockSize; j++) {
                    sum += Math.abs(channelData[i * blockSize + j]);
                }
                this.waveformData.push(sum / blockSize);
            }
            
            const max = Math.max(...this.waveformData);
            const barWidth = width / samples;
            const barGap = 1;
            
            // Draw all bars in gray
            this.extendWaveformCtx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            for (let i = 0; i < samples; i++) {
                const barHeight = (this.waveformData[i] / max) * height * 0.8;
                const x = i * barWidth;
                const y = height - barHeight;
                this.extendWaveformCtx.fillRect(x, y, barWidth - barGap, barHeight);
            }
            
        } catch (error) {
            console.error('Error drawing waveform:', error);
            this.drawFallbackWaveform(width, height);
        }
    }

    drawFallbackWaveform(width, height) {
        const bars = 100;
        const barWidth = width / bars;
        const barGap = 2;
        this.waveformData = [];
        
        this.extendWaveformCtx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        for (let i = 0; i < bars; i++) {
            const barHeight = Math.random() * 0.6 + 0.2;
            this.waveformData.push(barHeight);
            const x = i * barWidth;
            const y = height - (barHeight * height);
            this.extendWaveformCtx.fillRect(x, y, barWidth - barGap, barHeight * height);
        }
    }

    redrawWaveformWithSelection() {
        if (!this.extendWaveformCanvas || !this.extendWaveformCtx || !this.waveformData) return;
        
        const width = this.extendWaveformCanvas.width;
        const height = this.extendWaveformCanvas.height;
        const samples = this.waveformData.length;
        const barWidth = width / samples;
        const barGap = 1;
        
        const progressPercent = (this.extendAudioPlayer && this.extendAudioPlayer.duration) ? 
            (this.extendAudioPlayer.currentTime / this.extendAudioPlayer.duration) * 100 : 0;
        const playedBars = Math.floor((progressPercent / 100) * samples);
        
        this.extendWaveformCtx.clearRect(0, 0, width, height);
        
        const max = Math.max(...this.waveformData);
        
        // Draw unplayed part (gray)
        this.extendWaveformCtx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        for (let i = playedBars; i < samples; i++) {
            const barHeight = (this.waveformData[i] / max) * height * 0.8;
            const x = i * barWidth;
            const y = height - barHeight;
            this.extendWaveformCtx.fillRect(x, y, barWidth - barGap, barHeight);
        }
        
        // Draw played part (accent color)
        this.extendWaveformCtx.fillStyle = '#6366f1';
        for (let i = 0; i < playedBars; i++) {
            const barHeight = (this.waveformData[i] / max) * height * 0.8;
            const x = i * barWidth;
            const y = height - barHeight;
            this.extendWaveformCtx.fillRect(x, y, barWidth - barGap, barHeight);
        }
    }

    updateProgress() {
        if (!this.extendAudioPlayer || !this.extendAudioPlayer.duration) return;
        
        const progressPercent = (this.extendAudioPlayer.currentTime / this.extendAudioPlayer.duration) * 100;
        
        if (this.extendWaveformCanvas && this.extendWaveformCtx && this.waveformData) {
            const width = this.extendWaveformCanvas.width;
            const height = this.extendWaveformCanvas.height;
            const samples = this.waveformData.length;
            const barWidth = width / samples;
            const barGap = 1;
            const playedBars = Math.floor((progressPercent / 100) * samples);
            
            this.extendWaveformCtx.clearRect(0, 0, width, height);
            
            const max = Math.max(...this.waveformData);
            
            // Draw unplayed part (gray)
            this.extendWaveformCtx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            for (let i = playedBars; i < samples; i++) {
                const barHeight = (this.waveformData[i] / max) * height * 0.8;
                const x = i * barWidth;
                const y = height - barHeight;
                this.extendWaveformCtx.fillRect(x, y, barWidth - barGap, barHeight);
            }
            
            // Draw played part (accent color)
            this.extendWaveformCtx.fillStyle = '#6366f1';
            for (let i = 0; i < playedBars; i++) {
                const barHeight = (this.waveformData[i] / max) * height * 0.8;
                const x = i * barWidth;
                const y = height - barHeight;
                this.extendWaveformCtx.fillRect(x, y, barWidth - barGap, barHeight);
            }
        }
    }

    seekToPosition(percent) {
        if (!this.extendAudioPlayer || !this.extendAudioPlayer.duration) return;
        const time = (percent / 100) * this.extendAudioPlayer.duration;
        this.extendAudioPlayer.currentTime = time;
        this.updateProgress();
    }

    updateExtendTime(seconds) {
        const timeLabel = document.getElementById('extendTimeValue');
        if (timeLabel) {
            timeLabel.textContent = formatTime(seconds);
        }
    }

    updatePlayButton(isPlaying) {
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

    handleSubmit(e) {
        e.preventDefault();
        
        try {
            const formData = this.extractFormData();
            const errors = this.validateFormData(formData);
            
            if (errors.length > 0) {
                this.reportError(errors[0]);
                return;
            }

            // Build payload first to set displayValues
            const payload = this.buildPayload(formData);
            this.addAdvancedParams(payload, formData);

            // Create fake generation for UI feedback
            const tempIds = this.createFakeGeneration(formData);
            pendingTempTracks.push(...tempIds);
            
            socket.emit('generate_extend', payload);
        } catch (error) {
            this.reportError('An unexpected error occurred. Please try again.');
            console.error('Extend form error:', error);
        }
    }

    extractFormData() {
        const formData = new FormData(this.form);
        const uploadUrl = this.extendAudioUrlInput ? this.extendAudioUrlInput.value.trim() : '';
        
        if (!uploadUrl) {
            throw new Error('Please provide an audio URL before creating an extension task.');
        }

        const modelVal = formData.get('extendModel');
        if (!modelVal) {
            throw new Error('Select a model before submitting an extend task.');
        }

        const promptField = document.getElementById('extendPrompt');
        const titleField = document.getElementById('extendTitle');
        const styleField = document.getElementById('extendStyle');
        const continueAtField = document.getElementById('continueAt');

        let continueAtRaw = continueAtField ? continueAtField.value.trim() : '';
        
        // Auto-fill continueAt from audio player if not set
        if (!continueAtRaw && this.extendAudioPlayer && !Number.isNaN(this.extendAudioPlayer.currentTime)) {
            continueAtRaw = this.extendAudioPlayer.currentTime.toFixed(1);
        }

        return {
            modelVal,
            uploadUrl,
            promptVal: promptField ? promptField.value.trim() : '',
            titleVal: titleField ? titleField.value.trim() : '',
            styleVal: styleField ? styleField.value.trim() : '',
            continueAtRaw,
            isCustom: this.isChecked('extendCustomMode', 'true'),
            isInstrumental: this.isChecked('extendInstrumental', 'true')
        };
    }

    validateFormData(formData) {
        return ValidationUtils.validateExtendForm(formData);
    }

    buildPayload(formData) {
        const continueAtNum = parseFloat(formData.continueAtRaw);
        
        const payload = {
            uploadUrl: formData.uploadUrl,
            defaultParamFlag: formData.isCustom,
            instrumental: formData.isInstrumental,
            model: formData.modelVal,
            callBackUrl: "https://example.com/callback",
            continueAt: continueAtNum
        };

        if (formData.isCustom) {
            payload.style = formData.styleVal;
            payload.title = formData.titleVal;
        }

        if ((formData.isCustom && !formData.isInstrumental && formData.promptVal) || 
            (!formData.isCustom && formData.promptVal)) {
            payload.prompt = formData.promptVal;
        }

        // Store display values for fake generation
        this.displayValues = {
            displayTitle: formData.titleVal || 'Extended Track',
            displayStyle: formData.styleVal || 'Original Style',
            displayPrompt: formData.promptVal || 'Processing...'
        };

        return payload;
    }

    addAdvancedParams(payload, formData) {
        // Negative tags
        const negTagsField = document.getElementById('extendNegativeTags');
        const negTags = negTagsField ? negTagsField.value.trim() : '';
        if (negTags) payload.negativeTags = negTags;

        // Style weight
        const sw = document.getElementById('extendStyleWeight');
        if (sw && sw.dataset.touched === "true") payload.styleWeight = parseFloat(sw.value);

        // Audio weight
        const aw = document.getElementById('extendAudioWeight');
        if (aw && aw.dataset.touched === "true") payload.audioWeight = parseFloat(aw.value);

        // Weirdness
        const wd = document.getElementById('extendWeirdness');
        if (wd && wd.dataset.touched === "true") payload.weirdnessConstraint = parseFloat(wd.value);
        
        return payload;
    }

    createFakeGeneration(formData) {
        const { displayTitle, displayStyle, displayPrompt } = this.displayValues;
        return createFakeGeneration(formData.modelVal, displayTitle, displayStyle, displayPrompt);
    }

    isChecked(name, value) {
        const element = document.querySelector(`input[name="${name}"]:checked`);
        return element && element.value === value;
    }

    reportError(message) {
        if (!message) return;
        if (typeof logApi === 'function') {
            logApi({ type: 'error', msg: message });
        } else {
            console.warn('[ExtendForm]', message);
        }
    }
}

// Global function for play button
window.playExtendTrack = function() {
    if (!window.extendFormHandler || !window.extendFormHandler.extendAudioPlayer) return;
    
    const player = window.extendFormHandler.extendAudioPlayer;
    if (player.paused) {
        // Stop main player when starting extend player
        if (window.audio && !window.audio.paused) {
            window.audio.pause();
            window.isPlaying = false;
            window.updatePlayButtonUI();
            renderLibrary();
        }
        player.play();
    } else {
        player.pause();
    }
};

// Initialize the extend form handler
window.extendFormHandler = new ExtendFormHandler();

// Global wrapper function for library.js compatibility
window.initExtendAudio = function(audioUrl) {
    if (window.extendFormHandler) {
        window.extendFormHandler.initExtendAudio(audioUrl);
    }
};
