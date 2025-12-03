require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fetch = require('node-fetch');
const SocketHandlers = require('./services/socket-handlers');
const ApiRequestService = require('./services/api-request-service');
const PollingService = require('./services/polling-service');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// Proxy route for direct file downloads to avoid cross-origin download issues
app.get('/download', async (req, res) => {
    const fileUrl = req.query.url;

    if (!fileUrl) {
        return res.status(400).send('Missing url parameter');
    }

    try {
        const response = await fetch(fileUrl);

        if (!response.ok) {
            return res.status(502).send('Failed to fetch file');
        }

        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        const disposition = response.headers.get('content-disposition');

        res.setHeader('Content-Type', contentType);
        // Force download if upstream didn't specify filename
        if (disposition) {
            res.setHeader('Content-Disposition', disposition);
        } else {
            res.setHeader('Content-Disposition', 'attachment');
        }

        response.body.pipe(res);
    } catch (err) {
        console.error('Download proxy error:', err);
        res.status(500).send('Internal download error');
    }
});

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