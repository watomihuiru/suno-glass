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
        
        const isCustom = document.getElementById('customMode').checked;
        const isInstrumental = document.getElementById('instrumental').checked;

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
        const isCustom = document.getElementById('coverCustomMode').checked;
        const isInstrumental = document.getElementById('coverInstrumental').checked;

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