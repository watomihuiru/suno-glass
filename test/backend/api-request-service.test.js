const ApiRequestService = require('../../services/api-request-service');
const fetch = require('node-fetch');

// Mock node-fetch
jest.mock('node-fetch');
const mockedFetch = fetch;

describe('ApiRequestService', () => {
    let apiRequestService;
    const mockBaseUrl = 'https://api.example.com';
    const mockApiKey = 'test-api-key';

    beforeEach(() => {
        process.env.SUNO_BASE_URL = mockBaseUrl;
        process.env.SUNO_API_KEY = mockApiKey;
        apiRequestService = new ApiRequestService();
        jest.clearAllMocks();
    });

    afterEach(() => {
        delete process.env.SUNO_BASE_URL;
        delete process.env.SUNO_API_KEY;
    });

    describe('makeRequest', () => {
        it('should make a successful API request', async () => {
            const mockResponse = {
                code: 200,
                data: { taskId: 'test-task-123' },
                msg: 'success'
            };

            mockedFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse
            });

            const url = `${mockBaseUrl}/test`;
            const payload = { test: 'data' };
            const result = await apiRequestService.makeRequest(url, payload);

            expect(result).toEqual(mockResponse);
            expect(mockedFetch).toHaveBeenCalledWith(url, expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    'Authorization': `Bearer ${mockApiKey}`,
                    'Content-Type': 'application/json'
                }),
                body: JSON.stringify(payload)
            }));
        });

        it('should handle API-level errors', async () => {
            const mockResponse = {
                code: 401,
                msg: 'Invalid API key'
            };

            mockedFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse
            });

            const url = `${mockBaseUrl}/test`;
            const payload = { test: 'data' };

            await expect(apiRequestService.makeRequest(url, payload)).rejects.toThrow();
        }, 10000); // Increase timeout for this test

        it('should handle HTTP errors', async () => {
            mockedFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                json: async () => ({ error: 'Server error' })
            });

            const url = `${mockBaseUrl}/test`;
            const payload = { test: 'data' };

            await expect(apiRequestService.makeRequest(url, payload)).rejects.toThrow();
        }, 10000); // Increase timeout for this test

        it('should retry on retryable errors', async () => {
            jest.useFakeTimers();
            const mockResponse = {
                code: 200,
                data: { success: true }
            };

            // First call fails with network error, second succeeds
            mockedFetch
                .mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => mockResponse
                });

            const url = `${mockBaseUrl}/test`;
            const payload = { test: 'data' };

            const requestPromise = apiRequestService.makeRequest(url, payload);
            
            // Fast-forward timers to skip retry delays
            await jest.advanceTimersByTimeAsync(5000);
            
            const result = await requestPromise;
            expect(result).toEqual(mockResponse);
            expect(mockedFetch).toHaveBeenCalledTimes(2);
            
            jest.useRealTimers();
        }, 15000);

        it('should not retry on 4xx errors (except 429)', async () => {
            mockedFetch.mockResolvedValueOnce({
                ok: false,
                status: 400,
                json: async () => ({ error: 'Bad request' })
            });

            const url = `${mockBaseUrl}/test`;
            const payload = { test: 'data' };

            await expect(apiRequestService.makeRequest(url, payload)).rejects.toThrow();
            expect(mockedFetch).toHaveBeenCalledTimes(1);
        });
    });

    describe('getTaskStatus', () => {
        it('should get task status successfully', async () => {
            const taskId = 'test-task-123';
            const mockResponse = {
                code: 200,
                data: {
                    status: 'PROCESSING',
                    response: { sunoData: [] }
                }
            };

            mockedFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse
            });

            const result = await apiRequestService.getTaskStatus(taskId);

            expect(result).toEqual(mockResponse);
            const fetchCall = mockedFetch.mock.calls[0];
            // Check that URL contains the taskId parameter (convert to string if it's a URL object)
            const urlString = typeof fetchCall[0] === 'string' ? fetchCall[0] : fetchCall[0].toString();
            expect(urlString).toContain('taskId=test-task-123');
            expect(fetchCall[1]).toMatchObject({
                method: 'GET',
                headers: expect.objectContaining({
                    'Authorization': `Bearer ${mockApiKey}`
                })
            });
        });

        it('should throw error if taskId is missing', async () => {
            await expect(apiRequestService.getTaskStatus(null)).rejects.toThrow('Не указан ID задачи');
            await expect(apiRequestService.getTaskStatus(undefined)).rejects.toThrow('Не указан ID задачи');
            await expect(apiRequestService.getTaskStatus('')).rejects.toThrow('Не указан ID задачи');
        });

        it('should handle task not found error', async () => {
            const taskId = 'non-existent-task';
            const mockResponse = {
                code: 404,
                msg: 'Task not found'
            };

            mockedFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse
            });

            await expect(apiRequestService.getTaskStatus(taskId)).rejects.toThrow('Задача не найдена');
        });
    });

    describe('getCredits', () => {
        it('should get credits successfully', async () => {
            const mockResponse = {
                code: 200,
                data: 100
            };

            mockedFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse
            });

            const result = await apiRequestService.getCredits();

            expect(result).toBe(100);
            expect(mockedFetch).toHaveBeenCalledWith(
                `${mockBaseUrl}/chat/credit`,
                expect.objectContaining({
                    method: 'GET',
                    headers: expect.objectContaining({
                        'Authorization': `Bearer ${mockApiKey}`
                    })
                })
            );
        });

        it('should handle credits API errors', async () => {
            const mockResponse = {
                code: 401,
                msg: 'Invalid API key'
            };

            mockedFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse
            });

            await expect(apiRequestService.getCredits()).rejects.toThrow();
        });
    });

    describe('getDownloadUrl', () => {
        it('should get download URL successfully', async () => {
            const fileUrl = 'https://example.com/file.mp3';
            const mockResponse = {
                code: 200,
                data: 'https://download.example.com/file.mp3'
            };

            mockedFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse
            });

            const result = await apiRequestService.getDownloadUrl(fileUrl);

            expect(result).toBe(mockResponse.data);
            expect(mockedFetch).toHaveBeenCalledWith(
                `${mockBaseUrl}/common/download-url`,
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'Authorization': `Bearer ${mockApiKey}`,
                        'Content-Type': 'application/json'
                    }),
                    body: JSON.stringify({ url: fileUrl })
                })
            );
        });

        it('should throw error if fileUrl is missing', async () => {
            await expect(apiRequestService.getDownloadUrl(null)).rejects.toThrow('Не указан URL файла');
            await expect(apiRequestService.getDownloadUrl(undefined)).rejects.toThrow('Не указан URL файла');
            await expect(apiRequestService.getDownloadUrl('')).rejects.toThrow('Не указан URL файла');
        });
    });

    describe('isRetryableError', () => {
        it('should return false for 4xx errors (except 429)', () => {
            const error = { status: 400 };
            expect(apiRequestService.isRetryableError(error)).toBe(false);
        });

        it('should return true for 429 errors', () => {
            const error = { status: 429 };
            expect(apiRequestService.isRetryableError(error)).toBe(true);
        });

        it('should return true for 5xx errors', () => {
            const error = { status: 500 };
            expect(apiRequestService.isRetryableError(error)).toBe(true);
        });

        it('should return false for fatal errors', () => {
            const error = { code: 'INVALID_API_KEY' };
            expect(apiRequestService.isRetryableError(error)).toBe(false);
        });
    });

    describe('handleApiRequest', () => {
        it('should handle API request with logging', async () => {
            const mockSocket = {
                emit: jest.fn()
            };

            const mockResponse = {
                code: 200,
                data: { taskId: 'test-task-123' }
            };

            mockedFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse
            });

            const url = `${mockBaseUrl}/test`;
            const payload = { test: 'data' };

            const result = await apiRequestService.handleApiRequest(mockSocket, url, payload);

            expect(result).toEqual(mockResponse);
            expect(mockSocket.emit).toHaveBeenCalledWith('api_log', {
                type: 'request',
                data: payload
            });
            expect(mockSocket.emit).toHaveBeenCalledWith('api_log', {
                type: 'response',
                data: mockResponse
            });
        });

        it('should log errors on API request failure', async () => {
            const mockSocket = {
                emit: jest.fn()
            };

            // Mock fetch to reject immediately (no retry delays)
            mockedFetch.mockRejectedValueOnce(new Error('Network error'));

            const url = `${mockBaseUrl}/test`;
            const payload = { test: 'data' };

            try {
                await apiRequestService.handleApiRequest(mockSocket, url, payload);
                // Should not reach here
                expect(true).toBe(false);
            } catch (error) {
                // Expected to throw
                expect(error).toBeDefined();
            }
            
            // Check that request was logged
            expect(mockSocket.emit).toHaveBeenCalledWith('api_log', {
                type: 'request',
                data: payload
            });
            
            // Check that error response was logged
            const responseLogCalls = mockSocket.emit.mock.calls.filter(
                call => call[0] === 'api_log' && call[1]?.type === 'response'
            );
            expect(responseLogCalls.length).toBeGreaterThan(0);
        }, 10000);
    });
});


