const ADVANCED_FIELD_IDS = {
    generate: {
        negativeTags: 'negativeTags',
        styleWeight: 'genStyleWeight',
        audioWeight: 'genAudioWeight',
        weirdness: 'genWeirdness',
        vocalGender: 'vocalGender'
    },
    cover: {
        negativeTags: 'coverNegativeTags',
        styleWeight: 'styleWeight',
        audioWeight: 'audioWeight',
        weirdness: 'weirdness',
        vocalGender: 'coverVocalGender'
    },
    extend: {
        negativeTags: 'extendNegativeTags',
        styleWeight: 'extendStyleWeight',
        audioWeight: 'extendAudioWeight',
        weirdness: 'extendWeirdness',
        vocalGender: 'extendVocalGender'
    }
};

// Validation utilities for form handling
const ValidationUtils = {
    // Model limits configuration
    DEFAULT_MODEL_LIMITS: { prompt: 500, style: 200 },
    NON_CUSTOM_PROMPT_LIMIT: 500,
    
    // Get model limits with fallback
    getModelLimits(modelKey) {
        if (typeof MODEL_LIMITS === 'object' && MODEL_LIMITS !== null) {
            return MODEL_LIMITS[modelKey] || MODEL_LIMITS['V3_5'] || this.DEFAULT_MODEL_LIMITS;
        }
        return this.DEFAULT_MODEL_LIMITS;
    },

    // Validate form fields based on mode and model
    validateForm(formData, mode = 'generate') {
        const errors = [];
        const { modelVal, promptVal, titleVal, styleVal, isCustom, isInstrumental } = formData;
        
        // Get limits for the model
        const limits = this.getModelLimits(modelVal);
        const MAX_TITLE_LEN = mode === 'extend' ? 100 : 80;
        const titleMax = (modelVal === 'V5' || modelVal === 'V4_5' || modelVal === 'V4_5PLUS') ? 100 : 80;
        
        // Determine prompt limit based on mode and custom mode
        const promptLimit = isCustom ? limits.prompt : Math.min(limits.prompt, this.NON_CUSTOM_PROMPT_LIMIT);
        
        // Validate prompt/lyrics
        if (!isCustom && !promptVal) {
            errors.push('Требуется описание песни в простом режиме.');
        }
        
        if (promptVal && promptVal.length > promptLimit) {
            errors.push(`Текст запроса превышает ${promptLimit} символов для выбранной конфигурации.`);
        }
        
        // Custom mode specific validations
        if (isCustom) {
            if (!titleVal) {
                errors.push('В пользовательском режиме требуется указать название.');
            } else if (titleVal.length > titleMax) {
                errors.push(`Название должно содержать не более ${titleMax} символов для выбранной модели.`);
            }
            
            if (!styleVal) {
                errors.push('В пользовательском режиме требуется указать стиль.');
            } else if (styleVal.length > limits.style) {
                errors.push(`Стиль превышает ${limits.style} символов для выбранной модели.`);
            }
            
            if (!isInstrumental && !promptVal) {
                errors.push('Текст песни обязателен при включенном вокале в пользовательском режиме.');
            }
        }
        
        return errors;
    },

    // Validate extend form specific fields
    validateExtendForm(formData) {
        const errors = this.validateForm(formData, 'extend');
        
        // Add extend-specific validation for continueAt
        const { continueAtRaw } = formData;
        const continueAtNum = parseFloat(continueAtRaw);
        
        if (!continueAtRaw || Number.isNaN(continueAtNum)) {
            errors.push('Select the extension point on the waveform before submitting.');
        } else if (continueAtNum <= 0) {
            errors.push('Continue At must be greater than 0 seconds.');
        }
        
        return errors;
    },

    // Validate file upload
    validateAudioFile(file) {
        if (!file) return false;
        
        // Check file size (10MB limit)
        if (file.size > 10 * 1024 * 1024) {
            return false;
        }
        
        // Check file type
        if (!file.type.startsWith('audio/')) {
            return false;
        }
        
        return true;
    },

    // Extract form data helper
    extractFormData(form, mode = 'generate') {
        const formData = new FormData(form);
        const modelPrefix = mode === 'generate' ? '' : mode;
        
        return {
            modelVal: formData.get(`${modelPrefix}Model`),
            promptVal: formData.get(`${mode}Prompt`)?.value?.trim() || '',
            titleVal: formData.get(`${mode}Title`)?.value?.trim() || '',
            styleVal: formData.get(`${mode}Style`)?.value?.trim() || '',
            isCustom: formData.get(`${mode}CustomMode`) === 'true',
            isInstrumental: formData.get(`${mode}Instrumental`) === 'true',
            continueAtRaw: formData.get('continueAt')?.value?.trim() || ''
        };
    },

    // Build API payload from form data
    buildApiPayload(formData, mode = 'generate') {
        const { modelVal, promptVal, titleVal, styleVal, isCustom, isInstrumental, continueAtRaw } = formData;
        
        const payload = {
            customMode: isCustom,
            instrumental: isInstrumental,
            model: modelVal,
            callBackUrl: "https://example.com/callback"
        };
        
        // Add prompt based on mode and instrumental setting
        if (!isCustom || !isInstrumental) {
            payload.prompt = promptVal;
        } else if (promptVal) {
            payload.prompt = promptVal;
        }
        
        // Add custom mode fields
        if (isCustom) {
            payload.style = styleVal;
            payload.title = titleVal;
        }
        
        // Add extend-specific fields
        if (mode === 'extend' && continueAtRaw) {
            payload.continueAt = parseFloat(continueAtRaw);
            payload.defaultParamFlag = isCustom;
        }
        
        return payload;
    },

    // Add optional advanced parameters to payload
    addAdvancedParams(payload, mode = 'generate') {
        const ids = ADVANCED_FIELD_IDS[mode] || ADVANCED_FIELD_IDS.generate;
        const isCustom = Boolean(payload.customMode ?? payload.defaultParamFlag);
        const isInstrumental = Boolean(payload.instrumental);

        const getTrimmedValue = (id) => {
            const element = document.getElementById(id);
            return element && typeof element.value === 'string' ? element.value.trim() : '';
        };

        const pickSliderValue = (id) => {
            const element = document.getElementById(id);
            if (!element || element.dataset?.touched !== 'true') return null;
            const parsed = parseFloat(element.value);
            return Number.isNaN(parsed) ? null : parsed;
        };
        
        const negTags = getTrimmedValue(ids.negativeTags);
        if (negTags) {
            payload.negativeTags = negTags;
        }
        
        const styleWeight = pickSliderValue(ids.styleWeight);
        if (styleWeight !== null) {
            payload.styleWeight = styleWeight;
        }
        
        const audioWeight = pickSliderValue(ids.audioWeight);
        if (audioWeight !== null) {
            payload.audioWeight = audioWeight;
        }
        
        const weirdness = pickSliderValue(ids.weirdness);
        if (weirdness !== null) {
            payload.weirdnessConstraint = weirdness;
        }
        
        if (isCustom && !isInstrumental && ids.vocalGender) {
            const genderField = document.getElementById(ids.vocalGender);
            const gender = genderField ? genderField.value : '';
            if (gender) {
                payload.vocalGender = gender;
            }
        }
        
        return payload;
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ValidationUtils;
}
