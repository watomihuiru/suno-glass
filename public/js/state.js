// Global State
const socket = io();
let library = []; 
let currentTrackId = null; 
let isPlaying = false;
let progressTimers = {}; 
let pendingTempTracks = [];
let isShuffle = false;
let isLoop = false;

// Limits Config
const MODEL_LIMITS = {
    'V3_5': { prompt: 3000, style: 200 },
    'V4': { prompt: 3000, style: 200 },
    'V4_5': { prompt: 5000, style: 1000 },
    'V4_5PLUS': { prompt: 5000, style: 1000 },
    'V5': { prompt: 5000, style: 1000 }
};

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