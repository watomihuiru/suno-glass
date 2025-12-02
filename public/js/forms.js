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
            errors.push('Требуется описание песни в простом режиме.');
        }

        if (promptVal && promptVal.length > limits.prompt) {
            errors.push(`Текст запроса превышает ${limits.prompt} символов для выбранной модели.`);
        }

        if (isCustom) {
            if (!titleVal) {
                errors.push('В пользовательском режиме требуется указать название.');
            } else if (titleVal.length > MAX_TITLE_LEN) {
                errors.push('Название должно содержать не более 80 символов.');
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

        if (errors.length > 0) {
            if (typeof reportGenerateError === 'function') {
                reportGenerateError(errors[0]);
            }
            if (window.showNotification) {
                window.showNotification(errors[0]);
            }
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
