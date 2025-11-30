// API service module for Suno API interactions
const ApiService = {
    // API endpoints
    ENDPOINTS: {
        GENERATE: '/generate',
        COVER: '/generate/upload-cover',
        EXTEND: '/generate/upload-extend',
        RECORD_INFO: '/generate/record-info'
    },

    // Configuration
    POLLING_INTERVAL: 8000,
    FATAL_ERRORS: ['FAILED', 'SENSITIVE_WORD_ERROR', 'CALLBACK_EXCEPTION'],

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
            const errorMsg = result.msg || 'API Error';
            socket.emit('error_message', errorMsg);
            socket.emit('task_failed_creation', { msg: errorMsg });
            return null;
        }
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
