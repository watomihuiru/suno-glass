// Cover form handling module
class CoverFormHandler {
    constructor() {
        this.form = document.getElementById('coverForm');
        this.uploadZone = document.getElementById('uploadZone');
        this.coverFileInput = document.getElementById('coverFileInput');
        this.coverAudioUrlInput = document.getElementById('coverAudioUrl');
        this.coverFile = null;
        
        this.init();
    }

    init() {
        // Form submission
        if (this.form) {
            this.form.addEventListener('submit', this.handleSubmit.bind(this));
        }

        // File upload handlers
        this.setupFileUpload();
    }

    setupFileUpload() {
        if (!this.uploadZone) return;

        // Click to upload
        this.uploadZone.addEventListener('click', () => {
            if (!this.coverAudioUrlInput.value) this.coverFileInput.click();
        });

        // Drag and drop
        this.uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.uploadZone.classList.add('dragover');
        });

        this.uploadZone.addEventListener('dragleave', () => {
            this.uploadZone.classList.remove('dragover');
        });

        this.uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.uploadZone.classList.remove('dragover');
            if (e.dataTransfer.files.length) {
                this.handleFile(e.dataTransfer.files[0]);
            }
        });

        // File input change
        if (this.coverFileInput) {
            this.coverFileInput.addEventListener('change', () => {
                if (this.coverFileInput.files.length) {
                    this.handleFile(this.coverFileInput.files[0]);
                }
            });
        }

        // Remove file button
        const removeFileBtn = document.getElementById('removeFileBtn');
        if (removeFileBtn) {
            removeFileBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.resetFile();
            });
        }

        // Remove track button
        const removeTrackBtn = document.getElementById('removeTrackBtn');
        if (removeTrackBtn) {
            removeTrackBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.resetTrack();
            });
        }
    }

    handleFile(file) {
        const validation = AppConfig.validateFile(file);
        if (!validation.valid) {
            this.reportError(validation.error);
            return;
        }

        this.coverAudioUrlInput.value = '';
        this.hideTrackPreview();
        this.coverFile = file;
        this.showFilePreview(file);
    }

    showFilePreview(file) {
        const uploadContent = document.getElementById('uploadContent');
        const filePreview = document.getElementById('filePreview');
        
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
        const uploadContent = document.getElementById('uploadContent');
        const filePreview = document.getElementById('filePreview');
        
        if (uploadContent) uploadContent.classList.remove('hidden');
        if (filePreview) filePreview.classList.add('hidden');
    }

    showTrackPreview() {
        const uploadContent = document.getElementById('uploadContent');
        const filePreview = document.getElementById('filePreview');
        const trackPreview = document.getElementById('trackPreview');
        
        if (uploadContent) uploadContent.classList.add('hidden');
        if (filePreview) filePreview.classList.add('hidden');
        if (trackPreview) trackPreview.classList.remove('hidden');
    }

    hideTrackPreview() {
        const trackPreview = document.getElementById('trackPreview');
        if (trackPreview) trackPreview.classList.add('hidden');
    }

    resetFile() {
        this.coverFile = null;
        if (this.coverFileInput) this.coverFileInput.value = '';
        this.hideFilePreview();
        this.hideTrackPreview();
    }

    resetTrack() {
        if (this.coverAudioUrlInput) this.coverAudioUrlInput.value = '';
        this.hideTrackPreview();
        this.hideFilePreview();
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
            
            socket.emit('generate_cover', payload);
        } catch (error) {
            this.reportError('An unexpected error occurred. Please try again.');
            console.error('Cover form error:', error);
        }
    }

    extractFormData() {
        const formData = new FormData(this.form);
        const uploadUrl = this.coverAudioUrlInput ? this.coverAudioUrlInput.value.trim() : '';
        
        if (!uploadUrl) {
            throw new Error('Please provide an audio URL before creating a cover.');
        }

        const modelVal = formData.get('coverModel');
        if (!modelVal) {
            throw new Error('Select a model before submitting a cover task.');
        }

        const promptField = document.getElementById('coverPrompt');
        const titleField = document.getElementById('coverTitle');
        const styleField = document.getElementById('coverStyle');
        
        return {
            modelVal,
            uploadUrl,
            promptVal: promptField ? promptField.value.trim() : '',
            titleVal: titleField ? titleField.value.trim() : '',
            styleVal: styleField ? styleField.value.trim() : '',
            isCustom: this.isChecked('coverCustomMode', 'true'),
            isInstrumental: this.isChecked('coverInstrumental', 'true')
        };
    }

    validateFormData(formData) {
        return ValidationUtils.validateForm(formData, 'cover');
    }

    buildPayload(formData) {
        const payload = {
            uploadUrl: formData.uploadUrl,
            customMode: formData.isCustom,
            instrumental: formData.isInstrumental,
            model: formData.modelVal,
            callBackUrl: "https://example.com/callback",
        };

        // Add prompt based on mode and instrumental setting
        if (!formData.isCustom || !formData.isInstrumental) {
            payload.prompt = formData.promptVal;
        } else if (formData.promptVal) {
            payload.prompt = formData.promptVal;
        }

        // Add custom mode fields
        if (formData.isCustom) {
            payload.style = formData.styleVal;
            payload.title = formData.titleVal;
        }

        // Store display values for fake generation
        this.displayValues = {
            displayTitle: formData.titleVal || 'Cover Track',
            displayStyle: formData.styleVal || 'New Style',
            displayPrompt: formData.promptVal || 'Processing...'
        };

        return payload;
    }

    addAdvancedParams(payload, formData) {
        // Negative tags
        const negTags = document.getElementById('coverNegativeTags');
        if (negTags && negTags.value.trim()) payload.negativeTags = negTags.value.trim();

        // Style weight
        const sw = document.getElementById('styleWeight');
        if (sw && sw.dataset.touched === "true") payload.styleWeight = parseFloat(sw.value);

        // Audio weight
        const aw = document.getElementById('audioWeight');
        if (aw && aw.dataset.touched === "true") payload.audioWeight = parseFloat(aw.value);

        // Weirdness
        const wd = document.getElementById('weirdness');
        if (wd && wd.dataset.touched === "true") payload.weirdnessConstraint = parseFloat(wd.value);

        // Vocal gender for custom mode with vocals
        if (formData.isCustom && !formData.isInstrumental) {
            const genderField = document.getElementById('coverVocalGender');
            const gender = genderField ? genderField.value : '';
            if (gender) payload.vocalGender = gender;
        }
        
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
            console.warn('[CoverForm]', message);
        }
    }
}

// Initialize the cover form handler
window.coverFormHandler = new CoverFormHandler();
