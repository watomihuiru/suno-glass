// --- LOGS ---
const jsonOutput = document.getElementById('jsonOutput');

document.getElementById('clearLogsBtn').addEventListener('click', () => { 
    jsonOutput.innerHTML = '<div class="log-entry info">Logs cleared.</div>'; 
});

function logApi(msg) {
    if(jsonOutput.querySelector('.info')) jsonOutput.innerHTML = '';
    
    const entry = document.createElement('div'); 
    entry.className = 'log-entry';
    
    const ts = new Date().toLocaleTimeString();
    
    // Специальная обработка для ОШИБОК
    if (msg.type === 'error') {
        entry.innerHTML = `
            <div class="log-timestamp">[${ts}]</div>
            <span class="log-type err">ERROR ${msg.code || ''}</span>
            <div class="error-text">${msg.msg}</div>
        `;
    } else {
        // Стандартная обработка (Request, Response, Poll)
        let cls = 'req', txt = 'REQUEST';
        if(msg.type === 'response') { cls = 'res'; txt = 'RESPONSE'; } 
        if(msg.type === 'poll') { cls = 'poll'; txt = 'POLLING'; }
        
        entry.innerHTML = `
            <div class="log-timestamp">[${ts}]</div>
            <span class="log-type ${cls}">${txt}</span>
            <div class="json-code">${JSON.stringify(msg.data, null, 2)}</div>
        `;
    }
    
    jsonOutput.prepend(entry);
}

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

// --- COUNTERS & LIMITS ---
const genPrompt = document.getElementById('prompt'), genStyle = document.getElementById('style'), genTitle = document.getElementById('title');
const genPromptCnt = document.getElementById('promptCounter'), genStyleCnt = document.getElementById('styleCounter'), genTitleCnt = document.getElementById('titleCounter');
const covPrompt = document.getElementById('coverPrompt'), covStyle = document.getElementById('coverStyle'), covTitle = document.getElementById('coverTitle');
const covPromptCnt = document.getElementById('coverPromptCounter'), covStyleCnt = document.getElementById('coverStyleCounter'), covTitleCnt = document.getElementById('coverTitleCounter');

function updateCounter(input, counterElement) {
    if (!input || !counterElement) return;
    counterElement.innerText = `${input.value.length} / ${input.maxLength}`;
}

if(genPrompt) genPrompt.addEventListener('input', () => updateCounter(genPrompt, genPromptCnt));
if(genStyle) genStyle.addEventListener('input', () => updateCounter(genStyle, genStyleCnt));
if(genTitle) genTitle.addEventListener('input', () => updateCounter(genTitle, genTitleCnt));
if(covPrompt) covPrompt.addEventListener('input', () => updateCounter(covPrompt, covPromptCnt));
if(covStyle) covStyle.addEventListener('input', () => updateCounter(covStyle, covStyleCnt));
if(covTitle) covTitle.addEventListener('input', () => updateCounter(covTitle, covTitleCnt));

function updateInputLimits() {
    const genModelBtn = document.querySelector('input[name="model"]:checked');
    if (genModelBtn) {
        const limits = MODEL_LIMITS[genModelBtn.value] || MODEL_LIMITS['V3_5'];
        if (genPrompt) { genPrompt.maxLength = limits.prompt; updateCounter(genPrompt, genPromptCnt); }
        if (genStyle) { genStyle.maxLength = limits.style; updateCounter(genStyle, genStyleCnt); }
        if (genTitle) { genTitle.maxLength = 80; updateCounter(genTitle, genTitleCnt); }
    }
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

// --- SLIDERS LOGIC ---
function updateSliderVisual(slider) {
    const val = parseFloat(slider.value);
    const min = parseFloat(slider.min) || 0;
    const max = parseFloat(slider.max) || 1;
    let percent = 0;
    if (max > min) percent = ((val - min) / (max - min)) * 100;
    if(percent < 0) percent = 0; if(percent > 100) percent = 100;
    slider.style.setProperty('--val-percent', `${percent}%`);
}

function setupAdvancedSliders(ids) {
    ids.forEach(id => {
        const slider = document.getElementById(id);
        if(!slider) return;
        slider.value = 0; slider.dataset.touched = "false"; slider.style.setProperty('--val-percent', '0%');
        slider.addEventListener('input', (e) => {
            slider.dataset.touched = "true";
            updateSliderVisual(slider);
            checkAdvancedState();
        });
    });
}
setupAdvancedSliders(['genStyleWeight', 'genAudioWeight', 'genWeirdness', 'styleWeight', 'audioWeight', 'weirdness']);

// --- RESET BUTTON LOGIC ---
function checkAdvancedState() {
    const genResetBtn = document.getElementById('genResetBtn');
    if (genResetBtn) {
        const genDirty = isDirty('negativeTags', 'vocalGender', ['genStyleWeight', 'genAudioWeight', 'genWeirdness']);
        if (genDirty) genResetBtn.classList.add('visible'); else genResetBtn.classList.remove('visible');
    }
    const covResetBtn = document.getElementById('coverResetBtn');
    if (covResetBtn) {
        const covDirty = isDirty('coverNegativeTags', 'coverVocalGender', ['styleWeight', 'audioWeight', 'weirdness']);
        if (covDirty) covResetBtn.classList.add('visible'); else covResetBtn.classList.remove('visible');
    }
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
    const tag = document.getElementById(tagId); if(tag) tag.value = "";
    const genderInput = document.getElementById(genderInputId); if(genderInput) genderInput.value = "";
    const genderOpts = document.getElementById(genderContainerId).querySelectorAll('.gender-option');
    genderOpts.forEach(o => o.classList.remove('active'));
    sliderIds.forEach(id => {
        const sl = document.getElementById(id);
        if(sl) { sl.value = 0; sl.dataset.touched = "false"; updateSliderVisual(sl); }
    });
    document.getElementById(btnId).classList.remove('visible');
}

document.getElementById('genResetBtn').addEventListener('click', () => resetAdvanced('negativeTags', 'genGenderOptions', 'vocalGender', ['genStyleWeight', 'genAudioWeight', 'genWeirdness'], 'genResetBtn'));
document.getElementById('coverResetBtn').addEventListener('click', () => resetAdvanced('coverNegativeTags', 'covGenderOptions', 'coverVocalGender', ['styleWeight', 'audioWeight', 'weirdness'], 'coverResetBtn'));
document.getElementById('negativeTags').addEventListener('input', checkAdvancedState);
document.getElementById('coverNegativeTags').addEventListener('input', checkAdvancedState);

// --- GENDER TOGGLES ---
function setupGenderToggle(groupId, hiddenInputId) {
    const group = document.getElementById(groupId);
    const input = document.getElementById(hiddenInputId);
    if (!group || !input) return;
    const options = group.querySelectorAll('.gender-option');
    options.forEach(opt => {
        opt.addEventListener('click', () => {
            const val = opt.getAttribute('data-value');
            if (opt.classList.contains('active')) {
                opt.classList.remove('active'); input.value = "";
            } else {
                options.forEach(o => o.classList.remove('active'));
                opt.classList.add('active'); input.value = val;
            }
            checkAdvancedState();
        });
    });
}
setupGenderToggle('genGenderOptions', 'vocalGender');
setupGenderToggle('covGenderOptions', 'coverVocalGender');

// --- FORM UI UPDATES ---
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
        customFields.classList.add('hidden'); promptContainer.classList.remove('hidden'); promptLabel.innerText = "Song Description"; genPrompt.placeholder = "A futuristic synthwave track...";
    }
}
if(customModeToggle) { customModeToggle.addEventListener('change', updateGenUI); instrumentalToggle.addEventListener('change', updateGenUI); updateGenUI(); updateInputLimits(); }

const coverCustomMode = document.getElementById('coverCustomMode');
const coverInstrumental = document.getElementById('coverInstrumental');
const coverCustomFields = document.getElementById('coverCustomFields');
const coverPromptContainer = document.getElementById('coverPromptContainer');
const coverPromptLabel = document.getElementById('coverPromptLabel');
const coverVocalGenderGroup = document.getElementById('coverVocalGenderGroup');

function updateCoverUI() {
    const isCustom = coverCustomMode.checked;
    const isInst = coverInstrumental.checked;
    if (isCustom) {
        coverCustomFields.classList.remove('hidden');
        if (isInst) { coverPromptContainer.classList.add('hidden'); if(coverVocalGenderGroup) coverVocalGenderGroup.classList.add('hidden'); } 
        else { coverPromptContainer.classList.remove('hidden'); coverPromptLabel.innerText = "Lyrics"; if(coverVocalGenderGroup) coverVocalGenderGroup.classList.remove('hidden'); }
    } else {
        coverCustomFields.classList.add('hidden'); coverPromptContainer.classList.remove('hidden'); coverPromptLabel.innerText = "Song Description";
    }
}
coverCustomMode.addEventListener('change', updateCoverUI); coverInstrumental.addEventListener('change', updateCoverUI); updateCoverUI();