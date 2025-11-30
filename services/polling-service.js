// Polling service module
class PollingService {
    constructor() {
        this.pollingIntervals = new Map(); // Track active polling intervals
        this.POLLING_INTERVAL = 8000;
        this.FATAL_ERRORS = ['FAILED', 'SENSITIVE_WORD_ERROR', 'CALLBACK_EXCEPTION'];
    }

    // Start polling for task status
    startPolling(socket, taskId, apiRequestService) {
        // Clear any existing interval for this task
        if (this.pollingIntervals.has(taskId)) {
            clearInterval(this.pollingIntervals.get(taskId).interval);
        }

        const interval = setInterval(async () => {
            try {
                const data = await apiRequestService.getTaskStatus(taskId);

                if (data.code === 200) {
                    const shouldContinue = this.handlePollingResponse(data, socket, taskId);
                    
                    if (!shouldContinue) {
                        // Stop polling
                        clearInterval(interval);
                        this.pollingIntervals.delete(taskId);
                    }
                } else {
                    // API error - stop polling
                    socket.emit('api_log', { type: 'error', code: data.code, msg: data.msg || "Polling Http Error" });
                    clearInterval(interval);
                    this.pollingIntervals.delete(taskId);
                }
            } catch (error) {
                console.error("Polling Error:", error);
                socket.emit('api_log', { type: 'error', code: 500, msg: error.message });
                clearInterval(interval);
                this.pollingIntervals.delete(taskId);
            }
        }, this.POLLING_INTERVAL);

        // Store interval reference
        this.pollingIntervals.set(taskId, {
            interval,
            socketId: socket.id,
            startTime: Date.now()
        });
    }

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

    // Check if error is fatal
    isFatalError(status) {
        return this.FATAL_ERRORS.some(error => 
            status.includes(error) || status === error
        );
    }

    // Clean up polling for disconnected socket
    cleanupSocketPolling(socketId) {
        const socketIntervals = Array.from(this.pollingIntervals.entries())
            .filter(([taskId, intervalData]) => intervalData.socketId === socketId);
            
        socketIntervals.forEach(([taskId, intervalData]) => {
            clearInterval(intervalData.interval);
            this.pollingIntervals.delete(taskId);
        });
    }

    // Get polling statistics
    getPollingStats() {
        const stats = {
            activePollingTasks: this.pollingIntervals.size,
            tasks: []
        };

        for (const [taskId, intervalData] of this.pollingIntervals.entries()) {
            stats.tasks.push({
                taskId,
                socketId: intervalData.socketId,
                duration: Date.now() - intervalData.startTime
            });
        }

        return stats;
    }
}

module.exports = PollingService;
