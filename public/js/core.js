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

function getDisplayModelName(rawName) {
    if (!rawName) return 'AI';
    const lower = rawName.toLowerCase();
    if (lower.includes('v5')) return 'v5';
    // Check for v4_5plus or v4_5_plus before v4_5 to avoid matching v4_5 first
    if (lower.includes('v4_5plus') || lower.includes('v4_5_plus') || lower.includes('v4.5+')) return 'v4.5+';
    if (lower.includes('v4_5') || lower.includes('v4.5')) return 'v4.5';
    if (lower.includes('v4')) return 'v4';
    if (lower.includes('v3_5') || lower.includes('v3.5')) return 'v3.5';
    return rawName;
}

function formatTime(s) {
    const m = Math.floor(s / 60);
    const sc = Math.floor(s % 60);
    return `${m}:${sc < 10 ? '0' : ''}${sc}`;
}

// Configuration management for the Suno AI application
const AppConfig = {
    // Model limits configuration
    MODEL_LIMITS: {
        'V3_5': { prompt: 3000, style: 200 },
        'V4': { prompt: 3000, style: 200 },
        'V4_5': { prompt: 5000, style: 1000 },
        'V4_5PLUS': { prompt: 5000, style: 1000 },
        'V5': { prompt: 5000, style: 1000 }
    },

    // Default limits
    DEFAULT_MODEL_LIMITS: { prompt: 500, style: 200 },
    NON_CUSTOM_PROMPT_LIMIT: 500,

    // Character limits for different fields
    TITLE_LIMITS: {
        'generate': 80,
        'cover': 80,
        'extend': 100
    },

    // Model-specific title limits
    MODEL_TITLE_LIMITS: {
        'V5': 100,
        'V4_5': 100,
        'V4_5PLUS': 100,
        'default': 80
    },

    // File upload limits
    FILE_LIMITS: {
        MAX_SIZE_MB: 10,
        MAX_DURATION_MINUTES: 8,
        ALLOWED_TYPES: ['audio/']
    },

    // API endpoints
    API_ENDPOINTS: {
        GENERATE: '/generate',
        COVER: '/generate/upload-cover',
        EXTEND: '/generate/upload-extend',
        RECORD_INFO: '/generate/record-info'
    },

    // Polling configuration
    POLLING: {
        INTERVAL_MS: 8000,
        MAX_ATTEMPTS: 60, // 8 минут с интервалом 8 секунд
        FATAL_ERRORS: [
            'FAILED',
            'ERROR',
            'SENSITIVE_WORD_ERROR',
            'CALLBACK_EXCEPTION',
            'CREATE_TASK_FAILED',
            'GENERATE_AUDIO_FAILED'
        ]
    },

    // UI configuration
    UI: {
        PROGRESS_UPDATE_INTERVAL: 1000,
        PROGRESS_INCREMENT: 0.65, // ~154 секунды до 100% (было 0.8 = ~125 сек)
        FAKE_TRACK_COUNT: 2,
        PLACEHOLDER_IMAGE: 'https://placehold.co/100/18181b/ffffff?text=Loading',
        PLAYER_PLACEHOLDER: 'https://placehold.co/60'
    },

    // Get model limits with fallback
    getModelLimits(modelKey) {
        return this.MODEL_LIMITS[modelKey] || this.MODEL_LIMITS['V3_5'] || this.DEFAULT_MODEL_LIMITS;
    },

    // Get title limit based on model and mode
    getTitleLimit(modelKey, mode = 'generate') {
        const modelLimit = this.MODEL_TITLE_LIMITS[modelKey] || this.MODEL_TITLE_LIMITS['default'];
        return mode === 'extend' ? this.TITLE_LIMITS['extend'] : modelLimit;
    },

    // Get prompt limit based on model and custom mode
    getPromptLimit(modelKey, isCustom = false) {
        const limits = this.getModelLimits(modelKey);
        return isCustom ? limits.prompt : Math.min(limits.prompt, this.NON_CUSTOM_PROMPT_LIMIT);
    },

    // Check if error is fatal
    isFatalError(status) {
        return this.POLLING.FATAL_ERRORS.some(error =>
            status.includes(error) || status === error
        );
    },

    // Format file size for display
    formatFileSize(bytes) {
        const mb = bytes / (1024 * 1024);
        return `${mb.toFixed(2)} MB`;
    },

    // Validate file against limits
    validateFile(file) {
        if (!file) return { valid: false, error: 'No file provided' };

        // Check size
        if (file.size > this.FILE_LIMITS.MAX_SIZE_MB * 1024 * 1024) {
            return {
                valid: false,
                error: `File size exceeds ${this.FILE_LIMITS.MAX_SIZE_MB}MB limit`
            };
        }

        // Check type
        if (!this.FILE_LIMITS.ALLOWED_TYPES.some(type => file.type.startsWith(type))) {
            return {
                valid: false,
                error: 'Invalid file type. Only audio files are allowed.'
            };
        }

        return { valid: true, error: null };
    }
};

// Export for Node.js (если запускается в среде CommonJS)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AppConfig, getDisplayModelName, formatTime };
}
