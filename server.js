require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fetch = require('node-fetch');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // 1. Генерация с нуля
    socket.on('generate_music', async (payload) => {
        handleApiRequest(socket, `${process.env.SUNO_BASE_URL}/generate`, payload);
    });

    // 2. Генерация Кавера (НОВОЕ)
    socket.on('generate_cover', async (payload) => {
        // В реальном проекте здесь сначала нужно загрузить файл на сервер Suno (другой эндпоинт),
        // получить URL и вставить его в payload.uploadUrl.
        // Так как у нас нет документации на Upload File, мы отправляем запрос как есть.
        handleApiRequest(socket, `${process.env.SUNO_BASE_URL}/generate/upload-cover`, payload);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

// Универсальная функция для запросов
async function handleApiRequest(socket, url, payload) {
    try {
        socket.emit('api_log', { type: 'request', data: payload });

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.SUNO_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        const result = await response.json();

        socket.emit('api_log', { type: 'response', data: result });

        if (result.code === 200) {
            const taskId = result.data.taskId;
            socket.emit('task_created', { taskId });
            startPolling(socket, taskId);
        } else {
            socket.emit('error_message', result.msg || 'API Error');
        }

    } catch (error) {
        console.error(error);
        socket.emit('api_log', { type: 'response', data: { error: error.message } });
        socket.emit('error_message', 'Network Error');
    }
}

function startPolling(socket, taskId) {
    const interval = setInterval(async () => {
        try {
            const response = await fetch(`${process.env.SUNO_BASE_URL}/generate/record-info?taskId=${taskId}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${process.env.SUNO_API_KEY}` }
            });
            const data = await response.json();

            socket.emit('api_log', { type: 'poll', data: data });

            if (data.code === 200) {
                const status = data.data.status;
                const tracks = data.data.response ? data.data.response.sunoData : [];

                socket.emit('task_update', { taskId, status, tracks });

                if (status === 'SUCCESS' || status.includes('FAILED')) {
                    clearInterval(interval);
                }
            }
        } catch (error) {
            console.error("Polling Error:", error);
            socket.emit('api_log', { type: 'poll', data: { error: error.message } });
        }
    }, 3000);
}

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});