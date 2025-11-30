require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const SocketHandlers = require('./services/socket-handlers');
const ApiRequestService = require('./services/api-request-service');
const PollingService = require('./services/polling-service');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// Initialize services
const apiRequestService = new ApiRequestService();
const pollingService = new PollingService();
const socketHandlers = new SocketHandlers(io, apiRequestService, pollingService);

// Handle socket connections
io.on('connection', (socket) => {
    socketHandlers.handleConnection(socket);
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});