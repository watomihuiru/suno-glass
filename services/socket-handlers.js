// Socket handlers module
class SocketHandlers {
    constructor(io, apiRequestService, pollingService) {
        this.io = io;
        this.apiRequestService = apiRequestService;
        this.pollingService = pollingService;
    }

    // Handle new connection
    handleConnection(socket) {
        console.log('Client connected:', socket.id);
        
        // Register event handlers
        socket.on('generate_music', (payload) => this.handleGenerateMusic(socket, payload));
        socket.on('generate_cover', (payload) => this.handleGenerateCover(socket, payload));
        socket.on('generate_extend', (payload) => this.handleGenerateExtend(socket, payload));
        socket.on('disconnect', () => this.handleDisconnect(socket));
    }

    // Handle generate music request
    async handleGenerateMusic(socket, payload) {
        console.log(`[API] Generate Request (${payload.model})`);
        await this.handleApiRequest(socket, `${process.env.SUNO_BASE_URL}/generate`, payload);
    }

    // Handle generate cover request
    async handleGenerateCover(socket, payload) {
        console.log(`[API] Cover Request (${payload.model})`);
        await this.handleApiRequest(socket, `${process.env.SUNO_BASE_URL}/generate/upload-cover`, payload);
    }

    // Handle generate extend request
    async handleGenerateExtend(socket, payload) {
        console.log(`[API] Extend Request (${payload.model})`);
        await this.handleApiRequest(socket, `${process.env.SUNO_BASE_URL}/generate/upload-extend`, payload);
    }

    // Handle disconnect
    handleDisconnect(socket) {
        console.log('Client disconnected:', socket.id);
        
        // Clean up any polling intervals for this socket
        this.pollingService.cleanupSocketPolling(socket.id);
    }

    // Universal API request handler
    async handleApiRequest(socket, url, payload) {
        try {
            // Make API request with logging
            const result = await this.apiRequestService.handleApiRequest(socket, url, payload);

            // Handle response
            if (result.code === 200) {
                const taskId = result.data.taskId;
                socket.emit('task_created', { taskId });
                
                // Start polling for task status
                this.pollingService.startPolling(socket, taskId, this.apiRequestService);
            } else {
                const errorMsg = result.msg || 'API Error';
                socket.emit('error_message', errorMsg);
                socket.emit('task_failed_creation', { msg: errorMsg });
            }

        } catch (error) {
            socket.emit('error_message', 'Network Error');
            socket.emit('task_failed_creation', { msg: 'Network Error: ' + error.message });
        }
    }
}

module.exports = SocketHandlers;
