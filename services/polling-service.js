// Polling service module
const { 
    FATAL_ERRORS,
    REQUEST_TIMEOUT
} = require('./error-codes');

class PollingService {
    constructor() {
        this.pollingIntervals = new Map(); // Track active polling intervals
        this.POLLING_INTERVAL = 8000; // 8 seconds between polls
        this.MAX_POLLING_ATTEMPTS = 50; // Max polling attempts (about 6-7 minutes for 8s interval)
        this.POLLING_TIMEOUT = 10 * 60 * 1000; // 10 minutes max polling time
    }

    // Start polling for task status
    startPolling(socket, taskId, apiRequestService) {
        // Clear any existing interval for this task
        if (this.pollingIntervals.has(taskId)) {
            this.cleanupPolling(taskId);
        }

        const startTime = Date.now();
        let pollCount = 0;
        let isPolling = true;
        
        const poll = async () => {
            if (!isPolling) return;
            
            try {
                pollCount++;
                
                // Check if max attempts or timeout reached
                if (pollCount > this.MAX_POLLING_ATTEMPTS || 
                    (Date.now() - startTime) > this.POLLING_TIMEOUT) {
                    
                    const error = new Error('Превышено время ожидания выполнения задачи');
                    error.code = 'POLLING_TIMEOUT';
                    error.taskId = taskId;
                    
                    // Stop polling immediately
                    isPolling = false;
                    
                    // Clean up before emitting the error
                    this.cleanupPolling(taskId);
                    
                    // Emit the error
                    socket.emit('task_error', {
                        taskId,
                        code: error.code,
                        message: error.message,
                        timestamp: new Date().toISOString()
                    });
                    
                    // Don't throw, just return to stop further execution
                    return;
                }
                
                // Get task status
                const data = await apiRequestService.getTaskStatus(taskId);
                
                // Process the response
                const shouldContinue = this.handlePollingResponse(data, socket, taskId);
                
                // Stop polling if task is complete or failed
                if (!shouldContinue) {
                    isPolling = false;
                    this.cleanupPolling(taskId);
                    return;
                }
                
                // Schedule next poll if still polling
                if (isPolling) {
                    this.scheduleNextPoll(taskId, socket, poll);
                }
                
            } catch (error) {
                if (!isPolling) return;
                
                console.error(`[Polling Error] Task ${taskId}:`, error);
                
                // Emit error to client
                socket.emit('task_error', {
                    taskId,
                    code: error.code || 'POLLING_ERROR',
                    message: error.message,
                    details: error.details,
                    timestamp: new Date().toISOString()
                });
                
                // Clean up and stop polling
                isPolling = false;
                this.cleanupPolling(taskId);
            }
        };
        
        // Store polling context
        this.pollingIntervals.set(taskId, {
            interval: null, // Will be set by scheduleNextPoll
            socketId: socket.id,
            startTime,
            pollCount: 0,
            lastPollTime: null
        });
        
        // Start polling
        poll();
    }
    
    // Schedule the next poll with exponential backoff
    scheduleNextPoll(taskId, socket, pollFunction) {
        const pollingContext = this.pollingIntervals.get(taskId);
        if (!pollingContext) return;
        
        // Calculate delay with exponential backoff (capped at 30s)
        const baseDelay = Math.min(
            this.POLLING_INTERVAL * Math.pow(1.5, Math.floor(pollingContext.pollCount / 5)),
            30000
        );
        
        // Add jitter to prevent thundering herd
        const jitter = Math.random() * 1000;
        const delay = Math.floor(baseDelay + jitter);
        
        // Store the timeout ID
        pollingContext.interval = setTimeout(pollFunction, delay);
        pollingContext.lastPollTime = Date.now();
        pollingContext.pollCount++;
        
        // Log the next poll time
        const nextPollTime = new Date(Date.now() + delay);
        socket.emit('api_log', {
            type: 'poll',
            taskId,
            message: `Next poll in ${Math.round(delay/1000)}s at ${nextPollTime.toISOString()}`,
            timestamp: new Date().toISOString()
        });
    }
    
    // Clean up polling for a task
    cleanupPolling(taskId) {
        const pollingContext = this.pollingIntervals.get(taskId);
        if (!pollingContext) return;
        
        // Clear the interval/timeout
        if (pollingContext.interval) {
            clearTimeout(pollingContext.interval);
        }
        
        // Remove from tracking
        this.pollingIntervals.delete(taskId);
    }

    // Handle polling response
    handlePollingResponse(data, socket, taskId) {
        const { status, errorMessage, errorCode } = data.data || {};
        const tracks = (data.data?.response?.sunoData) ? data.data.response.sunoData : [];
        const timestamp = new Date().toISOString();
        
        // Prepare update object
        const update = {
            taskId,
            status,
            tracks,
            errorMessage,
            errorCode,
            timestamp
        };

        // Log the update
        socket.emit('api_log', { 
            type: 'poll', 
            taskId,
            status,
            timestamp,
            data: data.data
        });
        
        // Handle different statuses
        switch (status) {
            case 'SUCCESS':
                socket.emit('task_complete', update);
                socket.emit('task_update', update);
                return false; // Stop polling
                
            case 'FAILED':
            case 'ERROR':
                update.error = errorMessage || 'Произошла ошибка при обработке задачи';
                update.code = errorCode || 'TASK_FAILED';
                socket.emit('task_failed', update);
                socket.emit('task_update', update);
                return false; // Stop polling
                
            case 'PROCESSING':
            case 'PENDING':
            case 'QUEUED':
                // Continue polling for these statuses
                socket.emit('task_update', update);
                return true;
                
            default:
                // For any other status, log and continue polling
                console.warn(`[Polling] Unknown status '${status}' for task ${taskId}`);
                socket.emit('task_update', update);
                return true;
        }
    }

    // Check if error is fatal
    isFatalError(status) {
        if (!status) return false;
        return FATAL_ERRORS.some(error => 
            status.toString().includes(error) || status === error
        );
    }

    // Clean up polling for disconnected socket
    cleanupSocketPolling(socketId) {
        const socketIntervals = Array.from(this.pollingIntervals.entries())
            .filter(([taskId, intervalData]) => intervalData.socketId === socketId);
            
        socketIntervals.forEach(([taskId]) => {
            this.cleanupPolling(taskId);
        });
    }
    
    // Get polling statistics
    getPollingStats() {
        const now = Date.now();
        const stats = {
            activePollingTasks: this.pollingIntervals.size,
            tasks: []
        };

        for (const [taskId, intervalData] of this.pollingIntervals.entries()) {
            stats.tasks.push({
                taskId,
                socketId: intervalData.socketId,
                duration: Math.round((now - intervalData.startTime) / 1000) + 's',
                pollCount: intervalData.pollCount,
                lastPoll: intervalData.lastPollTime ? 
                    Math.round((now - intervalData.lastPollTime) / 1000) + 's ago' : 'Never'
            });
        }

        return stats;
    }
}

module.exports = PollingService;
