// API service module for Suno API interactions
const ApiService = {
    // API endpoints
    ENDPOINTS: {
        GENERATE: '/generate',
        COVER: '/generate/upload-cover',
        EXTEND: '/generate/upload-extend',
        RECORD_INFO: '/generate/record-info',
        CREDIT: '/chat/credit',
        DOWNLOAD_URL: '/common/download-url'
    },

    // Configuration
    POLLING_INTERVAL: 8000,
    FATAL_ERRORS: ['FAILED', 'SENSITIVE_WORD_ERROR', 'CALLBACK_EXCEPTION'],
    
    // Error messages mapping
    ERROR_MESSAGES: {
        401: 'Unauthorized - Please check your API key',
        402: 'Insufficient Credits - Account does not have enough credits',
        404: 'Not Found - The requested resource does not exist',
        422: 'Validation Error - Request parameters failed validation',
        429: 'Rate Limited - Too many requests. Please wait before retrying',
        455: 'Service Unavailable - System is currently undergoing maintenance',
        500: 'Server Error - An unexpected error occurred',
        505: 'Feature Disabled - The requested feature is currently disabled'
    },

    // Make API request
    async makeRequest(url, payload) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.SUNO_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            
            return await response.json();
        } catch (error) {
            console.error('API request error:', error);
            throw new Error('Network Error: ' + error.message);
        }
    },

    // Get task status
    async getTaskStatus(taskId) {
        try {
            const response = await fetch(`${process.env.SUNO_BASE_URL}${this.ENDPOINTS.RECORD_INFO}?taskId=${taskId}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${process.env.SUNO_API_KEY}` }
            });
            
            return await response.json();
        } catch (error) {
            console.error('Task status error:', error);
            throw new Error('Failed to get task status');
        }
    },

    // Get remaining credits
    async getCredits() {
        try {
            const response = await fetch(`${process.env.SUNO_BASE_URL}${this.ENDPOINTS.CREDIT}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${process.env.SUNO_API_KEY}` }
            });
            
            const result = await response.json();
            
            if (result.code === 200) {
                // API returns data as number (remaining credit quantity)
                return result.data; // This should be a number
            } else {
                throw new Error(this.getErrorMessage(result.code, result.msg));
            }
        } catch (error) {
            console.error('Credits check error:', error);
            throw error;
        }
    },

    // Get download URL for generated file
    async getDownloadUrl(fileUrl) {
        try {
            const response = await fetch(`${process.env.SUNO_BASE_URL}${this.ENDPOINTS.DOWNLOAD_URL}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.SUNO_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url: fileUrl })
            });
            
            const result = await response.json();
            
            if (result.code === 200) {
                return result.data;
            } else {
                throw new Error(this.getErrorMessage(result.code, result.msg));
            }
        } catch (error) {
            console.error('Download URL error:', error);
            throw error;
        }
    },

    // Check if error is fatal
    isFatalError(status) {
        return this.FATAL_ERRORS.some(error => 
            status.includes(error) || status === error
        );
    },

    // Handle API response
    handleResponse(result, socket) {
        if (result.code === 200) {
            const taskId = result.data.taskId;
            socket.emit('task_created', { taskId });
            return taskId;
        } else {
            const errorMsg = this.getErrorMessage(result.code, result.msg);
            socket.emit('api_log', { 
                type: 'error', 
                code: result.code, 
                msg: errorMsg,
                originalMessage: result.msg,
                timestamp: new Date().toISOString()
            });
            socket.emit('error_message', errorMsg);
            socket.emit('task_failed_creation', { msg: errorMsg });
            return null;
        }
    },

    // Get detailed error message based on error code
    getErrorMessage(code, originalMessage) {
        const baseMessage = this.ERROR_MESSAGES[code] || 'Unknown Error';
        return originalMessage && originalMessage !== 'success' 
            ? `${baseMessage}: ${originalMessage}`
            : baseMessage;
    },

    // Handle polling response
    handlePollingResponse(data, socket, taskId) {
        const { status, errorMessage, errorCode } = data.data;
        const tracks = (data.data.response && data.data.response.sunoData) ? data.data.response.sunoData : [];

        if (this.isFatalError(status)) {
            // Fatal error - stop polling
            socket.emit('api_log', { 
                type: 'error', 
                code: errorCode || 500, 
                msg: errorMessage || status 
            });
            socket.emit('task_update', { taskId, status, tracks, errorMessage });
            return false; // Stop polling
        }

        // Normal update
        socket.emit('api_log', { type: 'poll', data: data });
        socket.emit('task_update', { taskId, status, tracks, errorMessage });

        // Stop polling on success
        return status !== 'SUCCESS';
    }
};

module.exports = ApiService;
