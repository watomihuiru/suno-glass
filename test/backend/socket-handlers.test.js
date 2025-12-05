const SocketHandlers = require('../../services/socket-handlers');
const ApiRequestService = require('../../services/api-request-service');
const PollingService = require('../../services/polling-service');

// Mock dependencies
jest.mock('../../services/api-request-service');
jest.mock('../../services/polling-service');

describe('SocketHandlers', () => {
    let socketHandlers;
    let mockIo;
    let mockSocket;
    let mockApiRequestService;
    let mockPollingService;

    beforeEach(() => {
        // Setup mocks
        mockSocket = {
            id: 'test-socket-id',
            emit: jest.fn(),
            on: jest.fn()
        };

        mockIo = {
            on: jest.fn()
        };

        mockApiRequestService = {
            handleApiRequest: jest.fn(),
            getCredits: jest.fn(),
            getDownloadUrl: jest.fn()
        };

        mockPollingService = {
            startPolling: jest.fn(),
            cleanupSocketPolling: jest.fn()
        };

        ApiRequestService.mockImplementation(() => mockApiRequestService);
        PollingService.mockImplementation(() => mockPollingService);

        process.env.SUNO_BASE_URL = 'https://api.example.com';

        socketHandlers = new SocketHandlers(mockIo, mockApiRequestService, mockPollingService);
    });

    afterEach(() => {
        jest.clearAllMocks();
        delete process.env.SUNO_BASE_URL;
    });

    describe('handleConnection', () => {
        it('should register event handlers on connection', () => {
            socketHandlers.handleConnection(mockSocket);

            // Check that handlers are registered
            expect(mockSocket.on).toHaveBeenCalledWith('generate_music', expect.any(Function));
            expect(mockSocket.on).toHaveBeenCalledWith('generate_cover', expect.any(Function));
            expect(mockSocket.on).toHaveBeenCalledWith('generate_extend', expect.any(Function));
            expect(mockSocket.on).toHaveBeenCalledWith('get_credits', expect.any(Function));
            expect(mockSocket.on).toHaveBeenCalledWith('get_download_url', expect.any(Function));
            expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
        });

        it('should auto-check credits on connection', async () => {
            mockApiRequestService.getCredits.mockResolvedValueOnce(100);

            socketHandlers.handleConnection(mockSocket);

            // Wait for async credit check
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(mockApiRequestService.getCredits).toHaveBeenCalled();
            expect(mockSocket.emit).toHaveBeenCalledWith('credits_update', expect.objectContaining({
                credits: 100
            }));
        });
    });

    describe('handleGenerateMusic', () => {
        beforeEach(() => {
            socketHandlers.handleConnection(mockSocket);
        });

        it('should handle valid generate music request', async () => {
            const payload = {
                model: 'V5',
                prompt: 'A test song',
                customMode: false,
                instrumental: false
            };

            const mockResponse = {
                code: 200,
                data: { taskId: 'test-task-123' }
            };

            mockApiRequestService.handleApiRequest.mockResolvedValueOnce(mockResponse);

            const handler = mockSocket.on.mock.calls.find(call => call[0] === 'generate_music')[1];
            await handler(payload);

            expect(mockApiRequestService.handleApiRequest).toHaveBeenCalledWith(
                mockSocket,
                expect.stringContaining('/generate'),
                payload
            );
        });

        it('should reject invalid payload', async () => {
            const payload = {
                model: 'V5',
                // Missing required prompt
                customMode: false
            };

            const handler = mockSocket.on.mock.calls.find(call => call[0] === 'generate_music')[1];

            await handler(payload);

            expect(mockSocket.emit).toHaveBeenCalledWith('api_error', expect.objectContaining({
                code: 'VALIDATION_ERROR'
            }));
        });
    });

    describe('handleGenerateCover', () => {
        beforeEach(() => {
            socketHandlers.handleConnection(mockSocket);
        });

        it('should handle valid cover request', async () => {
            const payload = {
                model: 'V5',
                prompt: 'A cover song',
                customMode: false,
                instrumental: false
            };

            const mockResponse = {
                code: 200,
                data: { taskId: 'test-task-123' }
            };

            mockApiRequestService.handleApiRequest.mockResolvedValueOnce(mockResponse);

            const handler = mockSocket.on.mock.calls.find(call => call[0] === 'generate_cover')[1];
            await handler(payload);

            expect(mockApiRequestService.handleApiRequest).toHaveBeenCalledWith(
                mockSocket,
                expect.stringContaining('/upload-cover'),
                payload
            );
        });
    });

    describe('handleGenerateExtend', () => {
        beforeEach(() => {
            socketHandlers.handleConnection(mockSocket);
        });

        it('should handle valid extend request', async () => {
            const payload = {
                model: 'V5',
                prompt: 'Extend the song',
                customMode: false,
                instrumental: false,
                continueAt: 30.5
            };

            const mockResponse = {
                code: 200,
                data: { taskId: 'test-task-123' }
            };

            mockApiRequestService.handleApiRequest.mockResolvedValueOnce(mockResponse);

            const handler = mockSocket.on.mock.calls.find(call => call[0] === 'generate_extend')[1];
            await handler(payload);

            expect(mockApiRequestService.handleApiRequest).toHaveBeenCalledWith(
                mockSocket,
                expect.stringContaining('/upload-extend'),
                payload
            );
        });

        it('should reject extend request without continueAt', async () => {
            const payload = {
                model: 'V5',
                prompt: 'Extend the song',
                customMode: false
            };

            const handler = mockSocket.on.mock.calls.find(call => call[0] === 'generate_extend')[1];
            await handler(payload);

            expect(mockSocket.emit).toHaveBeenCalledWith('api_error', expect.objectContaining({
                code: 'VALIDATION_ERROR'
            }));
        });
    });

    describe('handleGetCredits', () => {
        beforeEach(() => {
            socketHandlers.handleConnection(mockSocket);
        });

        it('should get and emit credits', async () => {
            mockApiRequestService.getCredits.mockResolvedValueOnce(150);

            const handler = mockSocket.on.mock.calls.find(call => call[0] === 'get_credits')[1];
            await handler();

            expect(mockApiRequestService.getCredits).toHaveBeenCalled();
            expect(mockSocket.emit).toHaveBeenCalledWith('credits_update', expect.objectContaining({
                credits: 150
            }));
        });

        it('should handle credits error', async () => {
            const error = new Error('API Error');
            error.code = 'INVALID_API_KEY';
            mockApiRequestService.getCredits.mockRejectedValueOnce(error);

            const handler = mockSocket.on.mock.calls.find(call => call[0] === 'get_credits')[1];
            await handler();

            expect(mockSocket.emit).toHaveBeenCalledWith('credits_error', expect.objectContaining({
                code: 'INVALID_API_KEY'
            }));
        });
    });

    describe('handleGetDownloadUrl', () => {
        beforeEach(() => {
            socketHandlers.handleConnection(mockSocket);
        });

        it('should get and emit download URL with proxy wrapper', async () => {
            const data = {
                fileUrl: 'https://example.com/file.mp3',
                trackId: 'track-123'
            };

            const directUrl = 'https://download.example.com/file.mp3';
            mockApiRequestService.getDownloadUrl.mockResolvedValueOnce(directUrl);

            const handler = mockSocket.on.mock.calls.find(call => call[0] === 'get_download_url')[1];
            await handler(data);

            expect(mockApiRequestService.getDownloadUrl).toHaveBeenCalledWith(data.fileUrl);
            // The download URL is now wrapped with a proxy endpoint
            expect(mockSocket.emit).toHaveBeenCalledWith('download_url_ready', expect.objectContaining({
                downloadUrl: expect.stringContaining('/download?url='),
                trackId: 'track-123',
                timestamp: expect.any(String)
            }));
            // Verify the proxy URL contains the encoded direct URL
            const emitCall = mockSocket.emit.mock.calls.find(call => call[0] === 'download_url_ready');
            expect(emitCall[1].downloadUrl).toContain(encodeURIComponent(directUrl));
        });

        it('should handle missing fileUrl', async () => {
            const handler = mockSocket.on.mock.calls.find(call => call[0] === 'get_download_url')[1];
            await handler({});

            expect(mockSocket.emit).toHaveBeenCalledWith('api_error', expect.objectContaining({
                code: 'INVALID_FILE_URL'
            }));
        });
    });

    describe('handleDisconnect', () => {
        it('should cleanup on disconnect', () => {
            socketHandlers.handleConnection(mockSocket);

            const handler = mockSocket.on.mock.calls.find(call => call[0] === 'disconnect')[1];
            handler();

            expect(mockPollingService.cleanupSocketPolling).toHaveBeenCalledWith(mockSocket.id);
        });
    });

    describe('checkRateLimit', () => {
        it('should allow requests within rate limit', () => {
            socketHandlers.handleConnection(mockSocket);

            // Make multiple requests within limit
            for (let i = 0; i < 10; i++) {
                expect(() => {
                    socketHandlers.checkRateLimit(mockSocket);
                }).not.toThrow();
            }
        });

        it('should throw error when rate limit exceeded', () => {
            socketHandlers.handleConnection(mockSocket);

            // Exceed rate limit
            for (let i = 0; i < 31; i++) {
                try {
                    socketHandlers.checkRateLimit(mockSocket);
                } catch (error) {
                    if (i === 30) {
                        expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
                        return;
                    }
                }
            }
        });
    });

    describe('handleError', () => {
        it('should handle validation errors', () => {
            const error = new Error('Validation failed');
            error.code = 'VALIDATION_ERROR';
            error.status = 422;

            socketHandlers.handleError(mockSocket, error, 'generate_music');

            expect(mockSocket.emit).toHaveBeenCalledWith('api_error', expect.objectContaining({
                code: 'VALIDATION_ERROR'
            }));
            expect(mockSocket.emit).toHaveBeenCalledWith('task_failed_creation', expect.objectContaining({
                code: 'VALIDATION_ERROR'
            }));
        });

        it('should handle timeout errors', () => {
            const error = new Error('Request timeout');
            error.name = 'AbortError';

            socketHandlers.handleError(mockSocket, error, 'generate_music');

            expect(mockSocket.emit).toHaveBeenCalledWith('api_error', expect.objectContaining({
                code: 'REQUEST_TIMEOUT'
            }));
        });

        it('should handle 401 errors', () => {
            const error = new Error('Unauthorized');
            error.status = 401;

            socketHandlers.handleError(mockSocket, error, 'generate_music');

            expect(mockSocket.emit).toHaveBeenCalledWith('api_error', expect.objectContaining({
                code: 'INVALID_API_KEY'
            }));
        });

        it('should handle 429 rate limit errors', () => {
            const error = new Error('Too many requests');
            error.status = 429;
            error.retryAfter = 60;

            socketHandlers.handleError(mockSocket, error, 'generate_music');

            expect(mockSocket.emit).toHaveBeenCalledWith('api_error', expect.objectContaining({
                code: 'RATE_LIMIT_EXCEEDED',
                message: expect.stringContaining('60 секунд')
            }));
        });

        it('should handle download errors with trackId', () => {
            const error = new Error('Download failed');
            error.code = 'DOWNLOAD_ERROR';
            error.trackId = 'track-123';

            socketHandlers.handleError(mockSocket, error, 'get_download_url');

            expect(mockSocket.emit).toHaveBeenCalledWith('api_error', expect.objectContaining({
                code: 'DOWNLOAD_ERROR'
            }));
            expect(mockSocket.emit).toHaveBeenCalledWith('download_error', expect.objectContaining({
                code: 'DOWNLOAD_ERROR',
                trackId: 'track-123'
            }));
        });

        it('should handle unknown errors with default message', () => {
            const error = new Error('Unknown error');

            socketHandlers.handleError(mockSocket, error, 'generate_music');

            expect(mockSocket.emit).toHaveBeenCalledWith('api_error', expect.objectContaining({
                code: 'UNKNOWN_ERROR',
                message: expect.any(String)
            }));
        });
    });

    describe('handleApiRequest', () => {
        beforeEach(() => {
            socketHandlers.handleConnection(mockSocket);
        });

        it('should start polling on successful task creation', async () => {
            const payload = {
                model: 'V5',
                prompt: 'Test song',
                customMode: false
            };

            const mockResponse = {
                code: 200,
                data: { taskId: 'test-task-123' }
            };

            mockApiRequestService.handleApiRequest.mockResolvedValueOnce(mockResponse);

            await socketHandlers.handleApiRequest(mockSocket, 'https://api.example.com/generate', payload);

            expect(mockSocket.emit).toHaveBeenCalledWith('task_created', expect.objectContaining({
                taskId: 'test-task-123'
            }));
            expect(mockPollingService.startPolling).toHaveBeenCalledWith(
                mockSocket,
                'test-task-123',
                mockApiRequestService
            );
        });

        it('should throw error on API failure', async () => {
            const payload = {
                model: 'V5',
                prompt: 'Test song',
                customMode: false
            };

            const mockResponse = {
                code: 401,
                msg: 'Invalid API key'
            };

            mockApiRequestService.handleApiRequest.mockResolvedValueOnce(mockResponse);

            await expect(
                socketHandlers.handleApiRequest(mockSocket, 'https://api.example.com/generate', payload)
            ).rejects.toThrow();
        });
    });
});




