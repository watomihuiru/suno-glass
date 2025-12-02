// Socket handlers module
const { 
    ERROR_CODES, 
    FATAL_ERRORS,
    REQUEST_TIMEOUT
} = require('./error-codes');

// Model limits configuration
const MODEL_LIMITS = {
    V3_5: { prompt: 3000, style: 200, title: 80 },
    V4: { prompt: 3000, style: 200, title: 80 },
    V4_5: { prompt: 5000, style: 1000, title: 100 },
    V4_5PLUS: { prompt: 5000, style: 1000, title: 100 },
    V5: { prompt: 5000, style: 1000, title: 100 }
};

// Default limits
const DEFAULT_LIMITS = { prompt: 500, style: 200, title: 80 };
const NON_CUSTOM_PROMPT_LIMIT = 500;

// Validate payload against model limits
function validatePayload(payload, mode = 'generate') {
    const model = payload.model || 'V3_5';
    const limits = MODEL_LIMITS[model] || MODEL_LIMITS.V3_5;
    const errors = [];
    
    // Title validation
    const titleLimit = (model === 'V5' || model === 'V4_5' || model === 'V4_5PLUS') ? 100 : 80;
    if (payload.title && payload.title.length > titleLimit) {
        errors.push(`Title exceeds ${titleLimit} characters`);
    }
    
    // Prompt validation
    const promptLimit = payload.customMode ? limits.prompt : Math.min(limits.prompt, NON_CUSTOM_PROMPT_LIMIT);
    if (payload.prompt && payload.prompt.length > promptLimit) {
        errors.push(`Prompt exceeds ${promptLimit} characters`);
    }
    
    // Style validation (for custom mode)
    if (payload.customMode && payload.style && payload.style.length > limits.style) {
        errors.push(`Style exceeds ${limits.style} characters`);
    }
    
    // Required fields validation
    if (payload.customMode) {
        if (!payload.title) errors.push('Title is required in Custom Mode');
        if (!payload.style) errors.push('Style is required in Custom Mode');
        if (!payload.instrumental && !payload.prompt) {
            errors.push('Lyrics are required when vocals are enabled');
        }
    } else if (!payload.prompt) {
        errors.push('Song description is required in simple mode');
    }
    
    // Extend mode specific validation
    if (mode === 'extend' && (!payload.continueAt || isNaN(parseFloat(payload.continueAt)))) {
        errors.push('Valid continueAt timestamp is required for extend mode');
    }
    
    if (errors.length > 0) {
        const error = new Error(errors.join('; '));
        error.code = 'VALIDATION_ERROR';
        error.status = 422;
        throw error;
    }
}

// Rate limiting
const rateLimit = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30; // Max requests per minute per socket

class SocketHandlers {
    constructor(io, apiRequestService, pollingService) {
        this.io = io;
        this.apiRequestService = apiRequestService;
        this.pollingService = pollingService;
    }

    // Handle new connection
    handleConnection(socket) {
        console.log('Client connected:', socket.id);
        
        // Initialize rate limiting for this socket
        rateLimit.set(socket.id, {
            count: 0,
            resetTime: Date.now() + RATE_LIMIT_WINDOW,
            lastRequest: Date.now()
        });
        
        // Register event handlers with error handling
        const registerHandler = (event, handler) => {
            socket.on(event, async (...args) => {
                try {
                    // Check rate limit
                    this.checkRateLimit(socket);
                    
                    // Add timeout
                    const timeoutPromise = new Promise((_, reject) => {
                        setTimeout(
                            () => reject(new Error('Request timeout')), 
                            REQUEST_TIMEOUT
                        );
                    });
                    
                    // Execute handler with timeout
                    await Promise.race([
                        handler.call(this, socket, ...args),
                        timeoutPromise
                    ]);
                    
                } catch (error) {
                    this.handleError(socket, error, event);
                }
            });
        };
        
        // Register all handlers
        registerHandler('generate_music', this.handleGenerateMusic);
        registerHandler('generate_cover', this.handleGenerateCover);
        registerHandler('generate_extend', this.handleGenerateExtend);
        registerHandler('get_credits', this.handleGetCredits);
        registerHandler('get_download_url', this.handleGetDownloadUrl);
        
        // Handle disconnection
        socket.on('disconnect', () => this.handleDisconnect(socket));
        
        // Auto-check credits on connection
        this.handleGetCredits(socket).catch(error => {
            this.handleError(socket, error, 'get_credits');
        });
    }

    // Handle generate music request
    async handleGenerateMusic(socket, payload) {
        console.log(`[API] Generate Request (${payload.model})`);
        validatePayload(payload, 'generate');
        await this.handleApiRequest(socket, `${process.env.SUNO_BASE_URL}/generate`, payload);
    }

    // Handle generate cover request
    async handleGenerateCover(socket, payload) {
        console.log(`[API] Cover Request (${payload.model})`);
        validatePayload(payload, 'cover');
        await this.handleApiRequest(socket, `${process.env.SUNO_BASE_URL}/generate/upload-cover`, payload);
    }

    // Handle generate extend request
    async handleGenerateExtend(socket, payload) {
        console.log(`[API] Extend Request (${payload.model})`);
        validatePayload(payload, 'extend');
        await this.handleApiRequest(socket, `${process.env.SUNO_BASE_URL}/generate/upload-extend`, payload);
    }

    // Handle disconnect
    handleDisconnect(socket) {
        console.log('Client disconnected:', socket.id);
        
        // Clean up rate limiting
        rateLimit.delete(socket.id);
        
        // Clean up any polling intervals for this socket
        this.pollingService.cleanupSocketPolling(socket.id);
    }

    // Check rate limit for socket
    checkRateLimit(socket) {
        const now = Date.now();
        const clientRate = rateLimit.get(socket.id);
        
        // Reset rate limit window if expired
        if (now > clientRate.resetTime) {
            clientRate.count = 0;
            clientRate.resetTime = now + RATE_LIMIT_WINDOW;
        }
        
        // Increment request count
        clientRate.count++;
        clientRate.lastRequest = now;
        
        // Check if rate limit exceeded
        if (clientRate.count > MAX_REQUESTS_PER_WINDOW) {
            const retryAfter = Math.ceil((clientRate.resetTime - now) / 1000);
            const error = new Error('Слишком много запросов. Пожалуйста, подождите.');
            error.code = 'RATE_LIMIT_EXCEEDED';
            error.retryAfter = retryAfter;
            throw error;
        }
    }
    
    // Handle errors consistently
    handleError(socket, error, event) {
        console.error(`[${event}] Error:`, error);
        
        // Default error message
        let errorMessage = ERROR_CODES[error.code] || error.message || 'Произошла ошибка';
        let errorCode = error.code || 'UNKNOWN_ERROR';
        
        // Special handling for specific error types
        if (error.name === 'AbortError') {
            errorMessage = 'Превышено время ожидания ответа от сервера';
            errorCode = 'REQUEST_TIMEOUT';
        } else if (error.status === 401) {
            errorMessage = 'Неверный API ключ. Пожалуйста, проверьте настройки.';
            errorCode = 'INVALID_API_KEY';
        } else if (error.status === 422 || error.code === 'VALIDATION_ERROR') {
            errorMessage = error.message || 'Ошибка валидации данных';
            errorCode = 'VALIDATION_ERROR';
        } else if (error.status === 429) {
            errorMessage = `Слишком много запросов. Пожалуйста, подождите ${error.retryAfter || 60} секунд.`;
            errorCode = 'RATE_LIMIT_EXCEEDED';
        }
        
        // Emit error to client
        socket.emit('api_error', {
            code: errorCode,
            message: errorMessage,
            details: error.details,
            timestamp: new Date().toISOString(),
            event: event
        });
        
        // Emit specific error events
        if (event === 'get_credits') {
            socket.emit('credits_error', { 
                error: errorMessage,
                code: errorCode
            });
        } else if (event.startsWith('generate_')) {
            socket.emit('task_failed_creation', { 
                msg: errorMessage,
                code: errorCode
            });
        } else if (event === 'get_download_url') {
            socket.emit('download_error', {
                error: errorMessage,
                code: errorCode,
                trackId: error.trackId
            });
        }
    }
    
    // Handle get credits request
    async handleGetCredits(socket) {
        const credits = await this.apiRequestService.getCredits();
        socket.emit('credits_update', { 
            credits, 
            timestamp: new Date().toISOString() 
        });
    }

    // Handle get download URL request
    async handleGetDownloadUrl(socket, data) {
        const { fileUrl, trackId } = data;
        
        if (!fileUrl) {
            const error = new Error('Не указан URL файла для загрузки');
            error.code = 'INVALID_FILE_URL';
            error.trackId = trackId;
            throw error;
        }
        
        const downloadUrl = await this.apiRequestService.getDownloadUrl(fileUrl);
        socket.emit('download_url_ready', { 
            downloadUrl, 
            trackId,
            timestamp: new Date().toISOString()
        });
    }

    // Universal API request handler
    async handleApiRequest(socket, url, payload) {
        // Make API request with logging
        const result = await this.apiRequestService.handleApiRequest(socket, url, payload);

        // Handle response
        if (result.code === 200) {
            const taskId = result.data.taskId;
            if (!taskId) {
                throw new Error('Не получен ID задачи от сервера');
            }
            
            socket.emit('task_created', { 
                taskId,
                timestamp: new Date().toISOString()
            });
            
            // Start polling for task status
            this.pollingService.startPolling(socket, taskId, this.apiRequestService);
        } else {
            const error = new Error(result.msg || 'Ошибка API');
            error.code = result.code || 'API_ERROR';
            error.details = result.details;
            throw error;
        }
    }
}

module.exports = SocketHandlers;
