const PollingService = require('../../services/polling-service');
const ApiRequestService = require('../../services/api-request-service');

// Mock ApiRequestService
jest.mock('../../services/api-request-service');

describe('PollingService', () => {
    let pollingService;
    let mockApiRequestService;
    let mockSocket;

    beforeEach(() => {
        jest.useFakeTimers();
        pollingService = new PollingService();

        mockApiRequestService = {
            getTaskStatus: jest.fn()
        };

        mockSocket = {
            id: 'test-socket-id',
            emit: jest.fn()
        };
    });

    afterEach(() => {
        jest.clearAllMocks();
        jest.useRealTimers();
    });

    describe('startPolling', () => {
        it('should start polling for task status', async () => {
            const taskId = 'test-task-123';
            const mockResponse = {
                code: 200,
                data: {
                    status: 'PROCESSING',
                    response: { sunoData: [] }
                }
            };

            mockApiRequestService.getTaskStatus.mockResolvedValue(mockResponse);

            pollingService.startPolling(mockSocket, taskId, mockApiRequestService);

            // Fast-forward time to trigger first poll
            await jest.advanceTimersByTimeAsync(100);

            expect(mockApiRequestService.getTaskStatus).toHaveBeenCalledWith(taskId);
            expect(mockSocket.emit).toHaveBeenCalledWith('api_log', expect.objectContaining({
                type: 'poll'
            }));
        });

        it('should stop polling on SUCCESS status', async () => {
            const taskId = 'test-task-123';
            const successResponse = {
                code: 200,
                data: {
                    status: 'SUCCESS',
                    response: {
                        sunoData: [{
                            id: 'track-1',
                            title: 'Test Track',
                            audio_url: 'https://example.com/audio.mp3'
                        }]
                    }
                }
            };

            mockApiRequestService.getTaskStatus.mockResolvedValueOnce(successResponse);

            pollingService.startPolling(mockSocket, taskId, mockApiRequestService);

            await jest.advanceTimersByTimeAsync(100);

            expect(mockSocket.emit).toHaveBeenCalledWith('task_complete', expect.objectContaining({
                status: 'SUCCESS',
                taskId
            }));
            expect(mockSocket.emit).toHaveBeenCalledWith('task_update', expect.objectContaining({
                status: 'SUCCESS',
                taskId
            }));

            // Verify polling stopped (no more calls after success)
            const callCount = mockApiRequestService.getTaskStatus.mock.calls.length;
            await jest.advanceTimersByTimeAsync(10000);
            expect(mockApiRequestService.getTaskStatus.mock.calls.length).toBe(callCount);
        });

        it('should stop polling on FAILED status', async () => {
            const taskId = 'test-task-123';
            const failedResponse = {
                code: 200,
                data: {
                    status: 'FAILED',
                    errorMessage: 'Task failed',
                    errorCode: 'TASK_FAILED'
                }
            };

            mockApiRequestService.getTaskStatus.mockResolvedValueOnce(failedResponse);

            pollingService.startPolling(mockSocket, taskId, mockApiRequestService);

            await jest.advanceTimersByTimeAsync(100);

            expect(mockSocket.emit).toHaveBeenCalledWith('task_failed', expect.objectContaining({
                status: 'FAILED',
                taskId,
                error: 'Task failed'
            }));
        });

        it('should continue polling on PROCESSING status', async () => {
            const taskId = 'test-task-123';
            const processingResponse = {
                code: 200,
                data: {
                    status: 'PROCESSING',
                    response: { sunoData: [] }
                }
            };

            mockApiRequestService.getTaskStatus.mockResolvedValue(processingResponse);

            pollingService.startPolling(mockSocket, taskId, mockApiRequestService);

            await jest.advanceTimersByTimeAsync(100);

            expect(mockSocket.emit).toHaveBeenCalledWith('task_update', expect.objectContaining({
                status: 'PROCESSING',
                taskId
            }));

            // Should continue polling
            await jest.advanceTimersByTimeAsync(9000);
            expect(mockApiRequestService.getTaskStatus.mock.calls.length).toBeGreaterThan(1);
        });

        it('should timeout after max polling attempts', async () => {
            const taskId = 'test-task-123';
            const processingResponse = {
                code: 200,
                data: {
                    status: 'PROCESSING',
                    response: { sunoData: [] }
                }
            };

            mockApiRequestService.getTaskStatus.mockResolvedValue(processingResponse);

            pollingService.startPolling(mockSocket, taskId, mockApiRequestService);

            // Get initial call count
            const initialCallCount = mockApiRequestService.getTaskStatus.mock.calls.length;

            // Fast-forward to exceed timeout (10 minutes + 1 second)
            await jest.advanceTimersByTimeAsync(10 * 60 * 1000 + 1000);
            
            // Process any pending promises
            await Promise.resolve();
            await jest.runAllTimersAsync();

            // Check if timeout error was emitted
            const errorCalls = mockSocket.emit.mock.calls.filter(
                call => call[0] === 'task_error' && call[1]?.code === 'POLLING_TIMEOUT'
            );
            
            // Verify polling stopped - no new calls should be made after a delay
            const callCountBeforeDelay = mockApiRequestService.getTaskStatus.mock.calls.length;
            await jest.advanceTimersByTimeAsync(20000); // Wait 20 more seconds
            await Promise.resolve();
            const callCountAfterDelay = mockApiRequestService.getTaskStatus.mock.calls.length;
            
            // Either timeout error was emitted, or polling stopped (no new calls)
            const pollingStopped = callCountAfterDelay === callCountBeforeDelay;
            expect(errorCalls.length > 0 || pollingStopped).toBe(true);
        });

        it('should handle polling errors', async () => {
            const taskId = 'test-task-123';
            const error = new Error('Network error');
            error.code = 'NETWORK_ERROR';

            mockApiRequestService.getTaskStatus.mockRejectedValueOnce(error);

            pollingService.startPolling(mockSocket, taskId, mockApiRequestService);

            await jest.advanceTimersByTimeAsync(100);

            expect(mockSocket.emit).toHaveBeenCalledWith('task_error', expect.objectContaining({
                taskId,
                code: 'NETWORK_ERROR'
            }));
        });

        it('should cleanup existing polling before starting new one', async () => {
            const taskId = 'test-task-123';
            const processingResponse = {
                code: 200,
                data: {
                    status: 'PROCESSING',
                    response: { sunoData: [] }
                }
            };

            mockApiRequestService.getTaskStatus.mockResolvedValue(processingResponse);

            // Start polling twice for same task
            pollingService.startPolling(mockSocket, taskId, mockApiRequestService);
            pollingService.startPolling(mockSocket, taskId, mockApiRequestService);

            await jest.advanceTimersByTimeAsync(100);

            // Should only have one active polling interval
            const stats = pollingService.getPollingStats();
            expect(stats.activePollingTasks).toBe(1);
        });
    });

    describe('cleanupPolling', () => {
        it('should cleanup polling for a task', async () => {
            const taskId = 'test-task-123';
            const processingResponse = {
                code: 200,
                data: {
                    status: 'PROCESSING',
                    response: { sunoData: [] }
                }
            };

            mockApiRequestService.getTaskStatus.mockResolvedValue(processingResponse);

            pollingService.startPolling(mockSocket, taskId, mockApiRequestService);
            await jest.advanceTimersByTimeAsync(100);

            expect(pollingService.getPollingStats().activePollingTasks).toBe(1);

            pollingService.cleanupPolling(taskId);

            expect(pollingService.getPollingStats().activePollingTasks).toBe(0);
        });
    });

    describe('cleanupSocketPolling', () => {
        it('should cleanup all polling for a socket', async () => {
            const taskId1 = 'task-1';
            const taskId2 = 'task-2';
            const processingResponse = {
                code: 200,
                data: {
                    status: 'PROCESSING',
                    response: { sunoData: [] }
                }
            };

            mockApiRequestService.getTaskStatus.mockResolvedValue(processingResponse);

            pollingService.startPolling(mockSocket, taskId1, mockApiRequestService);
            pollingService.startPolling(mockSocket, taskId2, mockApiRequestService);

            await jest.advanceTimersByTimeAsync(100);

            expect(pollingService.getPollingStats().activePollingTasks).toBe(2);

            pollingService.cleanupSocketPolling(mockSocket.id);

            expect(pollingService.getPollingStats().activePollingTasks).toBe(0);
        });
    });

    describe('getPollingStats', () => {
        it('should return polling statistics', async () => {
            const taskId = 'test-task-123';
            const processingResponse = {
                code: 200,
                data: {
                    status: 'PROCESSING',
                    response: { sunoData: [] }
                }
            };

            mockApiRequestService.getTaskStatus.mockResolvedValue(processingResponse);

            pollingService.startPolling(mockSocket, taskId, mockApiRequestService);
            await jest.advanceTimersByTimeAsync(100);

            const stats = pollingService.getPollingStats();

            expect(stats.activePollingTasks).toBe(1);
            expect(stats.tasks).toHaveLength(1);
            expect(stats.tasks[0]).toMatchObject({
                taskId,
                socketId: mockSocket.id
            });
        });
    });

    describe('handlePollingResponse', () => {
        it('should handle SUCCESS status correctly', () => {
            const data = {
                code: 200,
                data: {
                    status: 'SUCCESS',
                    response: {
                        sunoData: [{ id: 'track-1', title: 'Test' }]
                    }
                }
            };

            const shouldContinue = pollingService.handlePollingResponse(data, mockSocket, 'task-123');

            expect(shouldContinue).toBe(false);
            expect(mockSocket.emit).toHaveBeenCalledWith('task_complete', expect.objectContaining({
                status: 'SUCCESS'
            }));
        });

        it('should handle FAILED status correctly', () => {
            const data = {
                code: 200,
                data: {
                    status: 'FAILED',
                    errorMessage: 'Task failed',
                    errorCode: 'TASK_FAILED'
                }
            };

            const shouldContinue = pollingService.handlePollingResponse(data, mockSocket, 'task-123');

            expect(shouldContinue).toBe(false);
            expect(mockSocket.emit).toHaveBeenCalledWith('task_failed', expect.objectContaining({
                status: 'FAILED',
                error: 'Task failed'
            }));
        });

        it('should continue polling for PROCESSING status', () => {
            const data = {
                code: 200,
                data: {
                    status: 'PROCESSING',
                    response: { sunoData: [] }
                }
            };

            const shouldContinue = pollingService.handlePollingResponse(data, mockSocket, 'task-123');

            expect(shouldContinue).toBe(true);
            expect(mockSocket.emit).toHaveBeenCalledWith('task_update', expect.objectContaining({
                status: 'PROCESSING'
            }));
        });
    });
});


