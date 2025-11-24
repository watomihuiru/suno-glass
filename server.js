require('dotenv').config();
const express = require('express');
const http = require('http'); // Нужен для связки Express + Socket.io
const { Server } = require('socket.io');
const fetch = require('node-fetch');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// Хранилище активных задач для отслеживания
const activeTasks = new Map();

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Слушаем событие запуска генерации от клиента
    socket.on('generate_music', async (payload) => {
        try {
            // 1. Логируем запрос (отправляем клиенту обратно для вкладки Logs)
            socket.emit('api_log', { type: 'request', data: payload });

            // 2. Делаем запрос к Suno API
            const response = await fetch(`${process.env.SUNO_BASE_URL}/generate`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.SUNO_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            const result = await response.json();

            // 3. Логируем ответ API
            socket.emit('api_log', { type: 'response', data: result });

            if (result.code === 200) {
                const taskId = result.data.taskId;
                
                // Сообщаем клиенту, что задача создана
                socket.emit('task_created', { taskId });

                // Запускаем отслеживание этой задачи
                startPolling(socket, taskId);
            } else {
                socket.emit('error_message', result.msg || 'API Error');
            }

        } catch (error) {
            console.error(error);
            socket.emit('api_log', { type: 'response', data: { error: error.message } });
            socket.emit('error_message', 'Network Error');
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
        // Здесь можно очистить интервалы, если нужно
    });
});

// Функция опроса статуса (Server-Side Polling)
function startPolling(socket, taskId) {
    // Если уже отслеживаем, не дублируем (хотя для простоты создаем новый интервал)
    
    const interval = setInterval(async () => {
        try {
            const response = await fetch(`${process.env.SUNO_BASE_URL}/generate/record-info?taskId=${taskId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${process.env.SUNO_API_KEY}`
                }
            });
            const data = await response.json();

            // Отправляем сырой лог клиенту (для вкладки Logs)
            socket.emit('api_log', { type: 'poll', data: data });

            if (data.code === 200) {
                const status = data.data.status;
                const tracks = data.data.response ? data.data.response.sunoData : [];

                // Отправляем обновление состояния треков клиенту (для UI)
                socket.emit('task_update', { 
                    taskId, 
                    status, 
                    tracks 
                });

                // Если готово или ошибка - останавливаем опрос
                if (status === 'SUCCESS' || status.includes('FAILED')) {
                    clearInterval(interval);
                }
            }
        } catch (error) {
            console.error("Polling Error:", error);
            socket.emit('api_log', { type: 'poll', data: { error: error.message } });
        }
    }, 3000); // Проверяем каждые 3 секунды
}

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});