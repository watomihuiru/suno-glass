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
        // Лог в консоль сервера (минимальный)
        console.log(`[API] Generate Request (${payload.model})`);
        handleApiRequest(socket, `${process.env.SUNO_BASE_URL}/generate`, payload);
    });

    // 2. Генерация Кавера
    socket.on('generate_cover', async (payload) => {
        console.log(`[API] Cover Request (${payload.model})`);
        handleApiRequest(socket, `${process.env.SUNO_BASE_URL}/generate/upload-cover`, payload);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

// Универсальная функция для создания задачи
async function handleApiRequest(socket, url, payload) {
    try {
        // Лог запроса в UI
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

        // Лог ответа в UI
        socket.emit('api_log', { type: 'response', data: result });

        if (result.code === 200) {
            const taskId = result.data.taskId;
            // Сообщаем клиенту taskId для привязки
            socket.emit('task_created', { taskId });
            // Запускаем опрос
            startPolling(socket, taskId);
        } else {
            // Ошибка при создании (например 402)
            socket.emit('error_message', result.msg || 'API Error');
            // Говорим клиенту удалить фейковые карточки
            socket.emit('task_failed_creation', { msg: result.msg || 'Unknown API Error' });
        }

    } catch (error) {
        console.error(error);
        socket.emit('api_log', { type: 'response', data: { error: error.message } });
        socket.emit('error_message', 'Network Error');
        socket.emit('task_failed_creation', { msg: 'Network Error: ' + error.message });
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

            if (data.code === 200) {
                const status = data.data.status;
                const errorMessage = data.data.errorMessage; 
                const errorCode = data.data.errorCode;
                const tracks = (data.data.response && data.data.response.sunoData) ? data.data.response.sunoData : [];

                // Список фатальных ошибок
                const isFatalError = status.includes('FAILED') || 
                                     status === 'SENSITIVE_WORD_ERROR' || 
                                     status === 'CALLBACK_EXCEPTION';

                if (isFatalError) {
                    // 1. Отправляем КРАСИВЫЙ лог ошибки в UI
                    socket.emit('api_log', { 
                        type: 'error', 
                        code: errorCode || 500, 
                        msg: errorMessage || status 
                    });

                    // 2. Уведомляем Main.js чтобы остановить UI и удалить карточки
                    socket.emit('task_update', { taskId, status, tracks, errorMessage });
                    
                    // 3. ВАЖНО: Останавливаем опрос, чтобы не спамить
                    clearInterval(interval);
                    return; 
                }

                // Если все ок, шлем обычный лог
                socket.emit('api_log', { type: 'poll', data: data });

                // Обновляем прогресс на клиенте
                socket.emit('task_update', { taskId, status, tracks, errorMessage });

                // Если успех — останавливаем опрос
                if (status === 'SUCCESS') {
                    clearInterval(interval);
                }

            } else {
                // Если сам API вернул код отличный от 200 (серверная ошибка)
                socket.emit('api_log', { type: 'error', code: data.code, msg: data.msg || "Polling Http Error" });
                clearInterval(interval);
            }
        } catch (error) {
            console.error("Polling Error:", error);
            socket.emit('api_log', { type: 'error', code: 500, msg: error.message });
            clearInterval(interval);
        }
    }, 8000); // Опрос каждые 8 секунд
}

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});