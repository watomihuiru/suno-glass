// API request service module
const fetch = require('node-fetch');

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

    // Make API request
    async makeRequest(url, payload) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            
            return await response.json();
        } catch (error) {
            console.error('API request error:', error);
            throw new Error('Network Error: ' + error.message);
        }
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
        try {
            const response = await fetch(`${this.baseUrl}/generate/record-info?taskId=${taskId}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${this.apiKey}` }
            });
            
            return await response.json();
        } catch (error) {
            console.error('Task status error:', error);
            throw new Error('Failed to get task status');
        }
    }

    // Get remaining credits
    async getCredits() {
        try {
            const response = await fetch(`${this.baseUrl}/chat/credit`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${this.apiKey}` }
            });
            
            const result = await response.json();
            
            if (result.code === 200) {
                // API returns data as number (remaining credit quantity)
                return result.data; // This should be a number
            } else {
                throw new Error(`Credits check failed: ${result.msg || 'Unknown error'}`);
            }
        } catch (error) {
            throw error;
        }
    }

    // Get download URL for file
    async getDownloadUrl(fileUrl) {
        try {
            const response = await fetch(`${this.baseUrl}/common/download-url`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url: fileUrl })
            });
            
            const result = await response.json();
            
            if (result.code === 200) {
                return result.data;
            } else {
                throw new Error(`Download URL failed: ${result.msg || 'Unknown error'}`);
            }
        } catch (error) {
            console.error('Download URL error:', error);
            throw error;
        }
    }
}

module.exports = ApiRequestService;
