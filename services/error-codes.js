// Коды ошибок API
const ERROR_CODES = {
    // HTTP статус-коды
    400: 'Неверный формат запроса',
    401: 'Неверный API ключ',
    402: 'Недостаточно средств на счете',
    403: 'Доступ запрещен',
    404: 'Ресурс не найден',
    409: 'Конфликт данных',
    422: 'Ошибка валидации',
    429: 'Слишком много запросов',
    500: 'Внутренняя ошибка сервера',
    502: 'Ошибка шлюза',
    503: 'Сервис временно недоступен',
    504: 'Таймаут шлюза',

    // Кастомные коды ошибок Suno API
    INVALID_API_KEY: 'Неверный API ключ',
    INSUFFICIENT_CREDITS: 'Недостаточно кредитов',
    TASK_NOT_FOUND: 'Задача не найдена',
    INVALID_TASK_ID: 'Неверный ID задачи',
    SENSITIVE_CONTENT: 'Обнаружен недопустимый контент',
    RATE_LIMIT_EXCEEDED: 'Превышен лимит запросов',
    SERVICE_UNAVAILABLE: 'Сервис временно недоступен',
    VALIDATION_ERROR: 'Ошибка валидации данных',
    UNKNOWN_ERROR: 'Неизвестная ошибка'
};

// Фатальные ошибки, при которых нужно остановить опрос
const FATAL_ERRORS = [
    'FAILED',
    'ERROR',
    'SENSITIVE_WORD_ERROR',
    'CALLBACK_EXCEPTION',
    'CREATE_TASK_FAILED',
    'GENERATE_AUDIO_FAILED',
    'INVALID_API_KEY',
    'INSUFFICIENT_CREDITS',
    'RATE_LIMIT_EXCEEDED',
    'SERVICE_UNAVAILABLE',
    'VALIDATION_ERROR'
];

// Максимальное количество повторных попыток
const MAX_RETRIES = 3;

// Базовая задержка между попытками (мс)
const RETRY_DELAY = 1000;

// Максимальное время ожидания ответа (мс)
const REQUEST_TIMEOUT = 30000;

module.exports = {
    ERROR_CODES,
    FATAL_ERRORS,
    MAX_RETRIES,
    RETRY_DELAY,
    REQUEST_TIMEOUT
};
