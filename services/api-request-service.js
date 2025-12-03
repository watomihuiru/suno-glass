// API request service module
const fetch = require('node-fetch');
const { 
    ERROR_CODES, 
    FATAL_ERRORS, 
    MAX_RETRIES, 
    RETRY_DELAY,
    REQUEST_TIMEOUT
} = require('./error-codes');

class ApiRequestService {
    constructor() {
        this.baseUrl = process.env.SUNO_BASE_URL;
        this.apiKey = process.env.SUNO_API_KEY;
        
        if (!this.baseUrl) {
            console.error('[API] SUNO_BASE_URL not set!');
        }
        if (!this.apiKey) {
            console.error('[API] SUNO_API_KEY not set!');
        }
    }

    // Make API request with retry logic
    async makeRequest(url, payload, retryCount = 0) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);

            // Handle non-OK responses
            if (!response.ok) {
                const error = new Error(`HTTP error! status: ${response.status}`);
                error.status = response.status;
                error.response = await response.json().catch(() => ({}));
                throw error;
            }

            const data = await response.json();
            
            // Handle API-level errors
            if (data.code && data.code !== 200) {
                const error = new Error(data.msg || ERROR_CODES[data.code] || 'API Error');
                error.code = data.code;
                error.details = data.details;
                throw error;
            }
            
            return data;
            
        } catch (error) {
            clearTimeout(timeoutId);
            
            // Handle timeout
            if (error.name === 'AbortError') {
                error.message = 'Превышено время ожидания ответа от сервера';
                error.code = 'REQUEST_TIMEOUT';
            }
            
            // Handle rate limiting
            if (error.status === 429) {
                const retryAfter = error.response?.retryAfter || 60;
                error.retryAfter = retryAfter;
                error.message = `Превышен лимит запросов. Повторите через ${retryAfter} секунд.`;
            }
            
            // Add more context to the error
            error.url = url;
            error.payload = payload;
            
            // Retry logic for retryable errors
            const isRetryable = this.isRetryableError(error) && retryCount < MAX_RETRIES;
            if (isRetryable) {
                const delay = RETRY_DELAY * Math.pow(2, retryCount);
                console.warn(`Retry ${retryCount + 1}/${MAX_RETRIES} after ${delay}ms: ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.makeRequest(url, payload, retryCount + 1);
            }
            
            throw error;
        }
    }
    
    // Check if error is retryable
    isRetryableError(error) {
        // Don't retry on 4xx errors except 429
        if (error.status >= 400 && error.status < 500 && error.status !== 429) {
            return false;
        }
        
        // Don't retry on fatal errors
        if (FATAL_ERRORS.includes(error.code)) {
            return false;
        }
        
        return true;
    }

    // Handle API request with logging
    async handleApiRequest(socket, url, payload) {
        try {
            // Log request
            socket.emit('api_log', { type: 'request', data: payload });

            // Make API request
            const result = await this.makeRequest(url, payload);

            // Log response
            socket.emit('api_log', { type: 'response', data: result });

            return result;
        } catch (error) {
            console.error('API request error:', error);
            socket.emit('api_log', { type: 'response', data: { error: error.message } });
            throw error;
        }
    }

    // Get task status
    async getTaskStatus(taskId) {
        if (!taskId) {
            const error = new Error('Не указан ID задачи');
            error.code = 'INVALID_TASK_ID';
            throw error;
        }
        
        const url = new URL(`${this.baseUrl}/generate/record-info`);
        url.searchParams.append('taskId', taskId);
        
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: { 
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Accept': 'application/json'
                }
            });
            
            if (!response.ok) {
                const error = new Error(`HTTP error! status: ${response.status}`);
                error.status = response.status;
                throw error;
            }
            
            const data = await response.json();
            
            // Handle task not found
            if (data.code === 404) {
                const error = new Error('Задача не найдена');
                error.code = 'TASK_NOT_FOUND';
                error.taskId = taskId;
                throw error;
            }
            
            return data;
            
        } catch (error) {
            console.error('Task status error:', error);
            
            // Add more context to the error
            error.taskId = taskId;
            
            if (!error.code) {
                error.code = 'TASK_STATUS_ERROR';
            }
            
            throw error;
        }
    }

    // Get remaining credits
    async getCredits() {
        try {
            const response = await fetch(`${this.baseUrl}/chat/credit`, {
                method: 'GET',
                headers: { 
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Accept': 'application/json'
                }
            });
            
            if (!response.ok) {
                const error = new Error(`HTTP error! status: ${response.status}`);
                error.status = response.status;
                throw error;
            }
            
            const result = await response.json();
            
            if (result.code === 200) {
                return result.data; // Should be a number (remaining credit quantity)
            } else {
                const error = new Error(ERROR_CODES[result.code] || result.msg || 'Не удалось получить информацию о кредитах');
                error.code = result.code || 'CREDITS_ERROR';
                error.details = result.details;
                throw error;
            }
        } catch (error) {
            console.error('Credits check error:', error);
            
            if (!error.code) {
                error.code = 'CREDITS_CHECK_ERROR';
            }
            
            throw error;
        }
    }

    // Get download URL for file
    async getDownloadUrl(fileUrl) {
        if (!fileUrl) {
            const error = new Error('Не указан URL файла для загрузки');
            error.code = 'INVALID_FILE_URL';
            throw error;
        }
        
        try {
            // If URL is already a direct KIE music file URL, return it as is
            if (typeof fileUrl === 'string' && fileUrl.startsWith('https://musicfile.kie.ai/')) {
                return fileUrl;
            }

            const response = await fetch(`${this.baseUrl}/common/download-url`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ url: fileUrl })
            });
            
            if (!response.ok) {
                const error = new Error(`HTTP error! status: ${response.status}`);
                error.status = response.status;
                throw error;
            }
            
            const result = await response.json();
            
            if (result.code === 200) {
                return result.data;
            } else {
                const error = new Error(ERROR_CODES[result.code] || result.msg || 'Не удалось получить URL для загрузки');
                error.code = result.code || 'DOWNLOAD_URL_ERROR';
                error.details = result.details;
                throw error;
            }
        } catch (error) {
            console.error('Download URL error:', error);
            
            if (!error.code) {
                error.code = 'DOWNLOAD_ERROR';
            }
            
            error.fileUrl = fileUrl;
            throw error;
        }
    }
}

module.exports = ApiRequestService;
