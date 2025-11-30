// Generate form handling module
class GenerateFormHandler {
    constructor() {
        this.form = document.getElementById('generateForm');
        this.init();
    }

    init() {
        if (this.form) {
            this.form.addEventListener('submit', this.handleSubmit.bind(this));
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
            
            socket.emit('generate_music', payload);
        } catch (error) {
            this.reportError('An unexpected error occurred. Please try again.');
            console.error('Generate form error:', error);
        }
    }

    extractFormData() {
        const formData = new FormData(this.form);
        const modelVal = formData.get('model');
        
        if (!modelVal) {
            throw new Error('Please select a model before generating.');
        }

        const promptField = document.getElementById('prompt');
        const titleField = document.getElementById('title');
        const styleField = document.getElementById('style');
        
        return {
            modelVal,
            promptVal: promptField ? promptField.value.trim() : '',
            titleVal: titleField ? titleField.value.trim() : '',
            styleVal: styleField ? styleField.value.trim() : '',
            isCustom: this.isChecked('customMode', 'true'),
            isInstrumental: this.isChecked('instrumental', 'true')
        };
    }

    validateFormData(formData) {
        return ValidationUtils.validateForm(formData, 'generate');
    }

    buildPayload(formData) {
        const payload = ValidationUtils.buildApiPayload(formData, 'generate');
        
        // Add display values for fake generation
        const displayTitle = formData.titleVal || "Generated Track";
        const displayStyle = formData.styleVal || "AI Style";
        const displayPrompt = formData.promptVal || "Processing...";
        
        this.displayValues = { displayTitle, displayStyle, displayPrompt };
        
        return payload;
    }

    addAdvancedParams(payload, formData) {
        // Negative tags
        const negTagsField = document.getElementById('negativeTags');
        const negTags = negTagsField ? negTagsField.value.trim() : '';
        if (negTags) payload.negativeTags = negTags;

        // Style weight
        const sw = document.getElementById('genStyleWeight');
        if (sw && sw.dataset.touched === "true") payload.styleWeight = parseFloat(sw.value);

        // Audio weight
        const aw = document.getElementById('genAudioWeight');
        if (aw && aw.dataset.touched === "true") payload.audioWeight = parseFloat(aw.value);

        // Weirdness
        const wd = document.getElementById('genWeirdness');
        if (wd && wd.dataset.touched === "true") payload.weirdnessConstraint = parseFloat(wd.value);

        // Vocal gender for custom mode with vocals
        if (formData.isCustom && !formData.isInstrumental) {
            const genderField = document.getElementById('vocalGender');
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
            console.warn('[GenerateForm]', message);
        }
    }
}

// Initialize the generate form handler
const generateFormHandler = new GenerateFormHandler();
