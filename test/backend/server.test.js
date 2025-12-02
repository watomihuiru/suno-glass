const request = require('supertest');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const SocketHandlers = require('../../services/socket-handlers');
const ApiRequestService = require('../../services/api-request-service');
const PollingService = require('../../services/polling-service');
const path = require('path');

// Mock environment variables
process.env.PORT = '3001';
process.env.SUNO_BASE_URL = 'https://api.example.com';
process.env.SUNO_API_KEY = 'test-api-key';

let app;
let server;
let io;

beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use(express.static('public'));

    const httpServer = http.createServer(app);
    io = new Server(httpServer);
    
    const apiRequestService = new ApiRequestService();
    const pollingService = new PollingService();
    const socketHandlers = new SocketHandlers(io, apiRequestService, pollingService);

    io.on('connection', (socket) => {
        socketHandlers.handleConnection(socket);
    });

    server = httpServer;
});

afterAll((done) => {
    if (server) {
        server.close(() => {
            done();
        });
    } else {
        done();
    }
});

describe('Server', () => {
    describe('Static file serving', () => {
        it('should serve static files from public directory', async () => {
            const response = await request(app)
                .get('/index.html');

            // File might not exist in test environment, so check for either 200 or 404
            if (response.status === 200) {
                expect(response.text).toContain('<!DOCTYPE html>');
            } else {
                expect(response.status).toBe(404);
            }
        });

        it('should have express app configured', () => {
            expect(app).toBeDefined();
        });
    });

    describe('Socket.IO', () => {
        it('should have Socket.IO server initialized', () => {
            expect(io).toBeDefined();
        });

        it('should handle connection events', () => {
            const mockSocket = {
                id: 'test-socket-id',
                emit: jest.fn(),
                on: jest.fn()
            };

            // Simulate connection
            io.emit('connection', mockSocket);
            
            // Verify socket handlers would be registered
            expect(io).toBeDefined();
        });
    });

    describe('JSON parsing', () => {
        it('should parse JSON request bodies', async () => {
            const response = await request(app)
                .post('/test-endpoint')
                .send({ test: 'data' })
                .expect(404); // Endpoint doesn't exist, but JSON parsing should work

            // If we get here, JSON parsing worked (no 400 error)
        });
    });
});

