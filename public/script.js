document.addEventListener('DOMContentLoaded', () => {
    
    const socket = io();

    let library = []; 
    let currentTrackId = null; 
    let isPlaying = false;
    let progressTimers = {}; 
    let pendingTempTracks = [];
    let isShuffle = false;
    let isLoop = false;

    // --- INIT & LIBRARY ---
    function loadLibrary() {
        try {
            const stored = localStorage.getItem('suno_library');
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed)) {
                    library = parsed;
                    renderLibrary();
                }
            }
        } catch (e) {
            console.error("Failed to load library", e);
        }
    }
    function saveLibrary() {
        localStorage.setItem('suno_library', JSON.stringify(library));
    }

    function getDisplayModelName(rawName) {
        if (!rawName) return 'AI';
        const lower = rawName.toLowerCase();
        if (lower.includes('v5')) return 'v5';
        if (lower.includes('v4_5_plus') || lower.includes('v4.5+')) return 'v4.5+';
        if (lower.includes('v4_5') || lower.includes('v4.5')) return 'v4.5';
        if (lower.includes('v4')) return 'v4';
        if (lower.includes('v3_5') || lower.includes('v3.5')) return 'v3.5';
        return rawName;
    }

    // --- ADVANCED TOGGLES ---
    function setupAdvancedToggle(toggleId, contentId) {
        const toggle = document.getElementById(toggleId);
        const content = document.getElementById(contentId);
        
        if (toggle && content) {
            const newToggle = toggle.cloneNode(true);
            toggle.parentNode.replaceChild(newToggle, toggle);
            
            newToggle.addEventListener('click', () => {
                newToggle.classList.toggle('active');
                content.classList.toggle('open');
            });
        }
    }
    setupAdvancedToggle('genAdvancedToggle', 'genAdvancedContent');
    setupAdvancedToggle('coverAdvancedToggle', 'coverAdvancedContent');

    // --- INPUT COUNTERS & LIMITS ---
    const genPrompt = document.getElementById('prompt');
    const genStyle = document.getElementById('style');
    const genTitle = document.getElementById('title');
    const genPromptCnt = document.getElementById('promptCounter');
    const genStyleCnt = document.getElementById('styleCounter');
    const genTitleCnt = document.getElementById('titleCounter');

    const covPrompt = document.getElementById('coverPrompt');
    const covStyle = document.getElementById('coverStyle');
    const covTitle = document.getElementById('coverTitle');
    const covPromptCnt = document.getElementById('coverPromptCounter');
    const covStyleCnt = document.getElementById('coverStyleCounter');
    const covTitleCnt = document.getElementById('coverTitleCounter');

    function updateCounter(input, counterElement) {
        if (!input || !counterElement) return;
        counterElement.innerText = `${input.value.length} / ${input.maxLength}`;
    }

    // Bind listeners
    if(genPrompt) genPrompt.addEventListener('input', () => updateCounter(genPrompt, genPromptCnt));
    if(genStyle) genStyle.addEventListener('input', () => updateCounter(genStyle, genStyleCnt));
    if(genTitle) genTitle.addEventListener('input', () => updateCounter(genTitle, genTitleCnt));
    
    if(covPrompt) covPrompt.addEventListener('input', () => updateCounter(covPrompt, covPromptCnt));
    if(covStyle) covStyle.addEventListener('input', () => updateCounter(covStyle, covStyleCnt));
    if(covTitle) covTitle.addEventListener('input', () => updateCounter(covTitle, covTitleCnt));

    const MODEL_LIMITS = {
        'V3_5': { prompt: 3000, style: 200 },
        'V4': { prompt: 3000, style: 200 },
        'V4_5': { prompt: 5000, style: 1000 },
        'V4_5_PLUS': { prompt: 5000, style: 1000 },
        'V5': { prompt: 5000, style: 1000 }
    };

    function updateInputLimits() {
        // Generate Tab
        const genModelBtn = document.querySelector('input[name="model"]:checked');
        if (genModelBtn) {
            const limits = MODEL_LIMITS[genModelBtn.value] || MODEL_LIMITS['V3_5'];
            if (genPrompt) { genPrompt.maxLength = limits.prompt; updateCounter(genPrompt, genPromptCnt); }
            if (genStyle) { genStyle.maxLength = limits.style; updateCounter(genStyle, genStyleCnt); }
            if (genTitle) { genTitle.maxLength = 80; updateCounter(genTitle, genTitleCnt); }
        }

        // Cover Tab
        const covModelBtn = document.querySelector('input[name="coverModel"]:checked');
        if (covModelBtn) {
            const limits = MODEL_LIMITS[covModelBtn.value] || MODEL_LIMITS['V3_5'];
            if (covPrompt) { covPrompt.maxLength = limits.prompt; updateCounter(covPrompt, covPromptCnt); }
            if (covStyle) { covStyle.maxLength = limits.style; updateCounter(covStyle, covStyleCnt); }
            if (covTitle) { covTitle.maxLength = 80; updateCounter(covTitle, covTitleCnt); }
        }
    }
    document.querySelectorAll('input[name="model"], input[name="coverModel"]').forEach(r => {
        r.addEventListener('change', updateInputLimits);
    });

    // --- NEW FEATURE LOGIC ---

    // 1. Gender Toggle Logic
    function setupGenderToggle(groupId, hiddenInputId) {
        const group = document.getElementById(groupId);
        const input = document.getElementById(hiddenInputId);
        if (!group || !input) return;

        const options = group.querySelectorAll('.gender-option');
        options.forEach(opt => {
            opt.addEventListener('click', () => {
                const val = opt.getAttribute('data-value');
                // If clicking active, deselect
                if (opt.classList.contains('active')) {
                    opt.classList.remove('active');
                    input.value = "";
                } else {
                    // Deselect others
                    options.forEach(o => o.classList.remove('active'));
                    opt.classList.add('active');
                    input.value = val;
                }
                checkAdvancedState(); // Check for reset button
            });
        });
    }
    setupGenderToggle('genGenderOptions', 'vocalGender');
    setupGenderToggle('covGenderOptions', 'coverVocalGender');

    // 2. Sliders Visuals & Logic
    function setupAdvancedSliders(ids) {
        ids.forEach(id => {
            const slider = document.getElementById(id);
            if(!slider) return;
            
            // Init visual
            updateSliderVisual(slider);

            slider.addEventListener('input', (e) => {
                slider.dataset.touched = "true";
                updateSliderVisual(slider);
                checkAdvancedState();
            });
        });
    }

    function updateSliderVisual(slider) {
        // Convert value 0-1 to percentage
        const val = parseFloat(slider.value);
        const min = parseFloat(slider.min) || 0;
        const max = parseFloat(slider.max) || 1;
        
        // Ensure valid numbers
        let percent = 0;
        if (max > min) {
            percent = ((val - min) / (max - min)) * 100;
        }
        
        if(percent < 0) percent = 0;
        if(percent > 100) percent = 100;

        slider.style.setProperty('--val-percent', `${percent}%`);
    }

    const sliderIds = ['genStyleWeight', 'genAudioWeight', 'genWeirdness', 'styleWeight', 'audioWeight', 'weirdness'];
    setupAdvancedSliders(sliderIds);

    // 3. Reset Button Logic
    function checkAdvancedState() {
        // Check Generate Tab
        const genResetBtn = document.getElementById('genResetBtn');
        const genDirty = isDirty('negativeTags', 'vocalGender', ['genStyleWeight', 'genAudioWeight', 'genWeirdness']);
        if(genResetBtn) genDirty ? genResetBtn.classList.remove('hidden') : genResetBtn.classList.add('hidden');

        // Check Cover Tab
        const covResetBtn = document.getElementById('coverResetBtn');
        const covDirty = isDirty('coverNegativeTags', 'coverVocalGender', ['styleWeight', 'audioWeight', 'weirdness']);
        if(covResetBtn) covDirty ? covResetBtn.classList.remove('hidden') : covResetBtn.classList.add('hidden');
    }

    function isDirty(tagId, genderId, sliderIds) {
        const tag = document.getElementById(tagId);
        if (tag && tag.value.trim() !== "") return true;
        
        const gender = document.getElementById(genderId);
        if (gender && gender.value !== "") return true;

        for (let id of sliderIds) {
            const sl = document.getElementById(id);
            if (sl && sl.dataset.touched === "true") return true;
        }
        return false;
    }

    function resetAdvanced(tagId, genderContainerId, genderInputId, sliderIds, btnId) {
        // Reset Tags
        const tag = document.getElementById(tagId);
        if(tag) tag.value = "";

        // Reset Gender
        const genderInput = document.getElementById(genderInputId);
        if(genderInput) genderInput.value = "";
        const genderOpts = document.getElementById(genderContainerId).querySelectorAll('.gender-option');
        genderOpts.forEach(o => o.classList.remove('active'));

        // Reset Sliders (Back to black/0)
        sliderIds.forEach(id => {
            const sl = document.getElementById(id);
            if(sl) {
                sl.value = 0; // Reset to 0 (full black)
                sl.dataset.touched = "false";
                updateSliderVisual(sl);
            }
        });

        // Hide Button
        document.getElementById(btnId).classList.add('hidden');
    }

    document.getElementById('genResetBtn').addEventListener('click', () => 
        resetAdvanced('negativeTags', 'genGenderOptions', 'vocalGender', ['genStyleWeight', 'genAudioWeight', 'genWeirdness'], 'genResetBtn'));
    
    document.getElementById('coverResetBtn').addEventListener('click', () => 
        resetAdvanced('coverNegativeTags', 'covGenderOptions', 'coverVocalGender', ['styleWeight', 'audioWeight', 'weirdness'], 'coverResetBtn'));

    // Listen for negative tags input
    document.getElementById('negativeTags').addEventListener('input', checkAdvancedState);
    document.getElementById('coverNegativeTags').addEventListener('input', checkAdvancedState);


    // --- TABS ---
    document.querySelectorAll('.menu li').forEach(item => {
        item.addEventListener('click', () => {
            const tabId = item.getAttribute('data-tab');
            if (!tabId) return; 
            document.querySelectorAll('.menu li').forEach(i => i.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
            item.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });

    // --- LOGS ---
    const jsonOutput = document.getElementById('jsonOutput');
    document.getElementById('clearLogsBtn').addEventListener('click', () => {
        jsonOutput.innerHTML = '<div class="log-entry info">Logs cleared.</div>';
    });
    socket.on('api_log', (msg) => {
        if(jsonOutput.querySelector('.info')) jsonOutput.innerHTML = '';
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        const ts = new Date().toLocaleTimeString();
        let cls = 'req', txt = 'REQUEST';
        if(msg.type === 'response') { cls = 'res'; txt = 'RESPONSE'; }
        if(msg.type === 'poll') { cls = 'poll'; txt = 'POLLING'; }
        entry.innerHTML = `<div class="log-timestamp">[${ts}]</div><span class="log-type ${cls}">${txt}</span><div class="json-code">${JSON.stringify(msg.data, null, 2)}</div>`;
        jsonOutput.prepend(entry);
    });

    // --- GENERATE UI ---
    const customModeToggle = document.getElementById('customMode');
    const instrumentalToggle = document.getElementById('instrumental');
    const customFields = document.getElementById('customFields');
    const promptContainer = document.getElementById('promptContainer');
    const promptLabel = document.getElementById('promptLabel');
    const vocalGenderGroup = document.getElementById('vocalGenderGroup');

    function updateGenUI() {
        const isCustom = customModeToggle.checked;
        const isInst = instrumentalToggle.checked;
        if (isCustom) {
            customFields.classList.remove('hidden');
            if (isInst) { promptContainer.classList.add('hidden'); if(vocalGenderGroup) vocalGenderGroup.classList.add('hidden'); } 
            else { promptContainer.classList.remove('hidden'); promptLabel.innerText = "Lyrics"; genPrompt.placeholder = "[Verse 1]..."; if(vocalGenderGroup) vocalGenderGroup.classList.remove('hidden'); }
        } else {
            customFields.classList.add('hidden');
            promptContainer.classList.remove('hidden'); promptLabel.innerText = "Song Description"; genPrompt.placeholder = "A futuristic synthwave track...";
        }
    }
    if(customModeToggle) {
        customModeToggle.addEventListener('change', updateGenUI);
        instrumentalToggle.addEventListener('change', updateGenUI);
        updateGenUI();
        updateInputLimits();
    }

    // --- GENERATE SUBMIT ---
    const generateForm = document.getElementById('generateForm');
    
    if(generateForm) {
        generateForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const modelVal = document.querySelector('input[name="model"]:checked').value;
            const promptVal = document.getElementById('prompt').value;
            const titleVal = document.getElementById('title').value || "Generated Track";
            const styleVal = document.getElementById('style').value || "AI Style";

            const tempIds = createFakeGeneration(modelVal, titleVal, styleVal, promptVal);
            pendingTempTracks.push(...tempIds);

            const payload = {
                prompt: promptVal,
                customMode: customModeToggle.checked,
                instrumental: instrumentalToggle.checked,
                model: modelVal,
                callBackUrl: "https://example.com/callback",
                negativeTags: document.getElementById('negativeTags').value || undefined
            };

            // Add slider values only if touched
            const sw = document.getElementById('genStyleWeight'); if(sw.dataset.touched === "true") payload.styleWeight = parseFloat(sw.value);
            const aw = document.getElementById('genAudioWeight'); if(aw.dataset.touched === "true") payload.audioWeight = parseFloat(aw.value);
            const wd = document.getElementById('genWeirdness'); if(wd.dataset.touched === "true") payload.weirdnessConstraint = parseFloat(wd.value);
            
            if(payload.customMode) {
                payload.style = styleVal; 
                payload.title = titleVal;
                if(!payload.instrumental) {
                    payload.vocalGender = document.getElementById('vocalGender').value;
                } else {
                    payload.prompt = ""; 
                }
            }
            socket.emit('generate_music', payload);
        });
    }

    // --- COVER UI & LOGIC ---
    const uploadZone = document.getElementById('uploadZone');
    const coverFileInput = document.getElementById('coverFileInput');
    const uploadContent = document.getElementById('uploadContent');
    const filePreview = document.getElementById('filePreview');
    const removeFileBtn = document.getElementById('removeFileBtn');
    
    const trackPreview = document.getElementById('trackPreview');
    const removeTrackBtn = document.getElementById('removeTrackBtn');
    const coverAudioUrlInput = document.getElementById('coverAudioUrl');
    
    let coverFile = null;

    uploadZone.addEventListener('click', () => {
        if (!coverAudioUrlInput.value) coverFileInput.click();
    });
    
    coverFileInput.addEventListener('change', () => { if(coverFileInput.files.length) handleFile(coverFileInput.files[0]); });
    removeFileBtn.addEventListener('click', (e) => { e.stopPropagation(); resetFile(); });
    
    if(removeTrackBtn) {
        removeTrackBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            coverAudioUrlInput.value = '';
            trackPreview.classList.add('hidden');
            uploadContent.classList.remove('hidden');
        });
    }

    function handleFile(file) {
        if(file.size > 10 * 1024 * 1024) { alert('File too large'); return; }
        if(!file.type.startsWith('audio/')) { alert('Audio only'); return; }
        coverAudioUrlInput.value = ''; 
        trackPreview.classList.add('hidden');
        coverFile = file;
        uploadContent.classList.add('hidden');
        filePreview.classList.remove('hidden');
        filePreview.querySelector('.file-name').innerText = file.name;
        filePreview.querySelector('.file-size').innerText = (file.size / 1024 / 1024).toFixed(2) + ' MB';
    }
    function resetFile() {
        coverFile = null; coverFileInput.value = '';
        uploadContent.classList.remove('hidden'); filePreview.classList.add('hidden');
    }

    const coverCustomMode = document.getElementById('coverCustomMode');
    const coverInstrumental = document.getElementById('coverInstrumental');
    const coverCustomFields = document.getElementById('coverCustomFields');
    const coverPromptContainer = document.getElementById('coverPromptContainer');
    const coverPromptLabel = document.getElementById('coverPromptLabel');
    const coverVocalGenderGroup = document.getElementById('coverVocalGenderGroup');
    
    function updateCoverUI() {
        const isCustom = coverCustomMode.checked;
        const isInst = coverInstrumental.checked;
        if(isCustom) {
            coverCustomFields.classList.remove('hidden');
            if(isInst) { 
                coverPromptContainer.classList.add('hidden'); 
                if(coverVocalGenderGroup) coverVocalGenderGroup.classList.add('hidden'); 
            } else { 
                coverPromptContainer.classList.remove('hidden'); 
                coverPromptLabel.innerText = "Lyrics"; 
                if(coverVocalGenderGroup) coverVocalGenderGroup.classList.remove('hidden'); 
            }
        } else {
            coverCustomFields.classList.add('hidden');
            coverPromptContainer.classList.remove('hidden'); coverPromptLabel.innerText = "Song Description";
        }
    }
    coverCustomMode.addEventListener('change', updateCoverUI);
    coverInstrumental.addEventListener('change', updateCoverUI);
    updateCoverUI();

    const coverForm = document.getElementById('coverForm');

    if(coverForm) {
        coverForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const hasFile = !!coverFile;
            const hasUrl = !!coverAudioUrlInput.value;
            if(!hasFile && !hasUrl) { alert('Please upload an audio file or select a track from library'); return; }

            const modelVal = document.querySelector('input[name="coverModel"]:checked').value;
            const promptVal = document.getElementById('coverPrompt').value;
            const titleVal = document.getElementById('coverTitle').value || "Cover Track";
            const styleVal = document.getElementById('coverStyle').value || "New Style";

            const tempIds = createFakeGeneration(modelVal, titleVal, styleVal, promptVal);
            pendingTempTracks.push(...tempIds);

            let finalUploadUrl = "";
            if (hasUrl) {
                finalUploadUrl = coverAudioUrlInput.value;
            } else {
                finalUploadUrl = "https://cdn.example.com/" + coverFile.name; 
            }

            const payload = {
                uploadUrl: finalUploadUrl,
                customMode: coverCustomMode.checked,
                instrumental: coverInstrumental.checked,
                model: modelVal,
                prompt: promptVal,
                callBackUrl: "https://example.com/callback",
                negativeTags: document.getElementById('coverNegativeTags').value,
                // Optional params
            };

            const sw = document.getElementById('styleWeight'); if(sw.dataset.touched === "true") payload.styleWeight = parseFloat(sw.value);
            const aw = document.getElementById('audioWeight'); if(aw.dataset.touched === "true") payload.audioWeight = parseFloat(aw.value);
            const wd = document.getElementById('weirdness'); if(wd.dataset.touched === "true") payload.weirdnessConstraint = parseFloat(wd.value);

            if(payload.customMode) {
                payload.style = styleVal;
                payload.title = titleVal;
                
                if(!payload.instrumental) {
                    payload.vocalGender = document.getElementById('coverVocalGender').value;
                } else {
                    payload.prompt = "";
                }
            }
            socket.emit('generate_cover', payload);
        });
    }

    // --- SOCKET LISTENERS ---
    socket.on('task_created', (data) => {
        if (pendingTempTracks.length > 0) {
            library = library.map(track => {
                if (pendingTempTracks.includes(track.id)) return { ...track, taskId: data.taskId };
                return track;
            });
            saveLibrary();
            pendingTempTracks = [];
        }
    });

    socket.on('error_message', (msg) => { alert('Server Error: ' + msg); });

    socket.on('task_update', (data) => {
        const { taskId, status, tracks } = data;
        if (tracks && tracks.length > 0) {
            let needsRender = false;
            tracks.forEach((serverTrack, index) => {
                let existingIndex = library.findIndex(t => t.id === serverTrack.id);
                if (existingIndex === -1) {
                    existingIndex = library.findIndex(t => t.taskId === taskId && t.id.startsWith('temp_'));
                    if (existingIndex !== -1) {
                        const tempId = library[existingIndex].id;
                        if (progressTimers[tempId]) { clearInterval(progressTimers[tempId]); delete progressTimers[tempId]; }
                    }
                }
                
                let modelToSave = serverTrack.model_name;
                if (!modelToSave && existingIndex !== -1) modelToSave = library[existingIndex].model_name;

                const trackObj = {
                    id: serverTrack.id, taskId: taskId,
                    title: serverTrack.title || library[existingIndex]?.title || "Generating...",
                    tags: serverTrack.tags || library[existingIndex]?.tags || "",
                    imageUrl: serverTrack.imageUrl || 'https://placehold.co/100/18181b/ffffff?text=Loading',
                    audioUrl: serverTrack.audioUrl || '',
                    duration: serverTrack.duration || 0,
                    status: (status === 'SUCCESS') ? 'complete' : 'generating',
                    model_name: modelToSave || 'AI',
                    lyrics: serverTrack.prompt || ""
                };

                if (existingIndex !== -1) library[existingIndex] = { ...library[existingIndex], ...trackObj };
                else library.unshift(trackObj);
                needsRender = true;
            });
            if(needsRender) { saveLibrary(); renderLibrary(); }
        }
    });

    function createFakeGeneration(model, title, tags, lyrics) {
        const now = new Date().toISOString();
        const id1 = 'temp_' + Date.now() + '_1';
        const id2 = 'temp_' + Date.now() + '_2';
        const newTracks = [
            { id: id1, title, tags, imageUrl: 'https://placehold.co/100/18181b/ffffff?text=Generating', audioUrl: '', model_name: model, status: 'generating', progress: 0, createdAt: now, lyrics: lyrics || "Processing..." },
            { id: id2, title, tags, imageUrl: 'https://placehold.co/100/18181b/ffffff?text=Generating', audioUrl: '', model_name: model, status: 'generating', progress: 0, createdAt: now, lyrics: lyrics || "Processing..." }
        ];
        library = [...newTracks, ...library];
        renderLibrary();
        simulateProgress(id1); simulateProgress(id2);
        return [id1, id2];
    }

    function simulateProgress(trackId) {
        let progress = 0;
        if (progressTimers[trackId]) clearInterval(progressTimers[trackId]);
        progressTimers[trackId] = setInterval(() => {
            progress += 0.8;
            const trackIndex = library.findIndex(t => t.id === trackId);
            if (trackIndex !== -1) {
                library[trackIndex].progress = progress;
                const card = document.querySelector(`[data-id="${trackId}"]`);
                if (card) {
                    const bar = card.querySelector('.loading-progress');
                    if (bar) bar.style.width = `${progress}%`;
                }
                if (progress >= 95) clearInterval(progressTimers[trackId]);
            } else { clearInterval(progressTimers[trackId]); delete progressTimers[trackId]; }
        }, 1000);
    }

    // --- LIBRARY MENU ACTIONS ---
    window.prepareCover = function(id) {
        const track = library.find(t => t.id === id);
        if (!track) return;
        if (!track.audioUrl) { alert("Audio URL is missing."); return; }

        document.querySelectorAll('.menu li').forEach(i => i.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
        document.querySelector('[data-tab="cover"]').classList.add('active');
        document.getElementById('cover').classList.add('active');

        resetFile();
        const coverAudioUrlInput = document.getElementById('coverAudioUrl');
        const trackPreview = document.getElementById('trackPreview');
        const uploadContent = document.getElementById('uploadContent');
        const filePreview = document.getElementById('filePreview');

        coverAudioUrlInput.value = track.audioUrl;
        uploadContent.classList.add('hidden');
        filePreview.classList.add('hidden');
        trackPreview.classList.remove('hidden');
        
        document.getElementById('trackPreviewImg').src = track.imageUrl;
        document.getElementById('trackPreviewTitle').innerText = track.title;
    };

    window.downloadTrack = function(id) {
        const track = library.find(t => t.id === id);
        if (!track || !track.audioUrl) return;
        const link = document.createElement('a');
        link.href = track.audioUrl;
        link.download = `${track.title}.mp3`;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // --- RENDER ---
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
                        <div class="dropdown-item" onclick="downloadTrack('${track.id}')"><i class="fa-solid fa-download"></i> Download</div>
                        <div class="dropdown-item delete" onclick="deleteTrack('${track.id}')"><i class="fa-solid fa-trash"></i> Delete</div>
                    </div>
                </div>` : ''}
                ${isGenerating ? `<div class="loading-progress" style="width: ${track.progress || 0}%"></div>` : ''}
            `;
            libraryGrid.appendChild(card);
        });
    }

    // --- GLOBAL ---
    window.togglePlay = function(id) {
        const track = library.find(t => t.id === id); if(!track) return;
        if(currentTrackId!==id){ loadTrack(track); audio.play(); isPlaying=true; } else { if(audio.paused){audio.play(); isPlaying=true;} else{audio.pause(); isPlaying=false;} }
        updatePlayButtonUI(); renderLibrary();
    };
    window.toggleMenu = function(e, id) { e.stopPropagation(); document.querySelectorAll('.dropdown-menu').forEach(el => el.classList.remove('show')); const menu = document.getElementById(`menu-${id}`); if(menu) menu.classList.toggle('show'); };
    document.addEventListener('click', () => { document.querySelectorAll('.dropdown-menu').forEach(el => el.classList.remove('show')); });
    window.deleteTrack = function(id) { if(confirm('Delete?')){ library = library.filter(t => t.id !== id); saveLibrary(); renderLibrary(); if(currentTrackId===id) resetPlayerUI(); } };

    const modal = document.getElementById('lyricsModal');
    const closeBtn = document.getElementById('closeModalBtn');
    window.openLyrics = function(id) {
        const track = library.find(t => t.id === id); if(!track) return;
        document.getElementById('modalCover').src = track.imageUrl; document.getElementById('modalTitle').innerText = track.title; document.getElementById('modalTags').innerText = track.tags; document.getElementById('modalLyrics').innerText = track.lyrics || "No lyrics.";
        modal.classList.remove('hidden');
    };
    closeBtn.addEventListener('click', () => modal.classList.add('hidden'));

    // --- PLAYER ---
    const audio = document.getElementById('audioElement');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const progressBar = document.getElementById('progressBar');
    const shuffleBtn = document.getElementById('shuffleBtn');
    const loopBtn = document.getElementById('loopBtn');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');

    function loadTrack(track) { currentTrackId = track.id; document.getElementById('playerCover').src = track.imageUrl; document.getElementById('playerTitle').innerText = track.title; document.getElementById('playerArtist').innerText = track.tags; audio.src = track.audioUrl; }
    function resetPlayerUI() { currentTrackId = null; isPlaying = false; document.getElementById('playerCover').src = 'https://placehold.co/60'; document.getElementById('playerTitle').innerText = 'Select a track'; document.getElementById('playerArtist').innerText = 'Suno AI'; updatePlayButtonUI(); }
    function updatePlayButtonUI() { playPauseBtn.innerHTML = isPlaying ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>'; }
    
    playPauseBtn.addEventListener('click', () => { if(!currentTrackId && library.length>0) { const ready = library.filter(t=>t.status==='complete' || t.status === 'SUCCESS'); if(ready.length) window.togglePlay(ready[0].id); return; } if(currentTrackId) window.togglePlay(currentTrackId); });
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
    audio.addEventListener('timeupdate', () => { if(!audio.duration) return; const pct = (audio.currentTime/audio.duration)*100; progressBar.value = pct; progressBar.style.setProperty('--seek-before-width', `${pct}%`); document.getElementById('currentTime').innerText = formatTime(audio.currentTime); document.getElementById('duration').innerText = formatTime(audio.duration); });
    progressBar.addEventListener('input', (e) => { if(!audio.duration) return; audio.currentTime = (e.target.value/100)*audio.duration; progressBar.style.setProperty('--seek-before-width', `${e.target.value}%`); });
    function formatTime(s) { const m = Math.floor(s/60); const sc = Math.floor(s%60); return `${m}:${sc<10?'0':''}${sc}`; }

    loadLibrary();
});