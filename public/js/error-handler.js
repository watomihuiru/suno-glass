// Error handling and logging utilities
const ErrorHandler = {
    // Log levels
    LOG_LEVELS: {
        ERROR: 'error',
        WARN: 'warn',
        INFO: 'info',
        DEBUG: 'debug'
    },

    // Error categories
    ERROR_CATEGORIES: {
        NETWORK: 'network',
        VALIDATION: 'validation',
        API: 'api',
        UI: 'ui',
        SYSTEM: 'system'
    },

    // Handle and log errors consistently
    handleError(error, category = ErrorHandler.ERROR_CATEGORIES.SYSTEM, context = {}) {
        const errorInfo = this.formatError(error, category, context);
        
        // Log to console
        this.logToConsole(errorInfo);
        
        // Log to UI if available
        this.logToUI(errorInfo);
        
        // Track error metrics
        this.trackError(errorInfo);
        
        return errorInfo;
    },

    // Format error information
    formatError(error, category, context) {
        const timestamp = new Date().toISOString();
        
        return {
            timestamp,
            category,
            message: error.message || 'Unknown error',
            stack: error.stack,
            context,
            level: this.determineLogLevel(category),
            id: this.generateErrorId()
        };
    },

    // Determine log level based on category
    determineLogLevel(category) {
        switch (category) {
            case this.ERROR_CATEGORIES.NETWORK:
            case this.ERROR_CATEGORIES.API:
                return this.LOG_LEVELS.ERROR;
            case this.ERROR_CATEGORIES.VALIDATION:
                return this.LOG_LEVELS.WARN;
            case this.ERROR_CATEGORIES.UI:
                return this.LOG_LEVELS.INFO;
            default:
                return this.LOG_LEVELS.ERROR;
        }
    },

    // Log to console with appropriate level
    logToConsole(errorInfo) {
        const message = `[${errorInfo.category.toUpperCase()}] ${errorInfo.message}`;
        
        switch (errorInfo.level) {
            case this.LOG_LEVELS.ERROR:
                console.error(message, errorInfo.context, errorInfo.stack);
                break;
            case this.LOG_LEVELS.WARN:
                console.warn(message, errorInfo.context);
                break;
            case this.LOG_LEVELS.INFO:
                console.info(message, errorInfo.context);
                break;
            case this.LOG_LEVELS.DEBUG:
                console.debug(message, errorInfo.context);
                break;
        }
    },

    // Log to UI if logApi function is available
    logToUI(errorInfo) {
        if (typeof logApi === 'function') {
            logApi({
                type: 'error',
                category: errorInfo.category,
                msg: errorInfo.message,
                context: errorInfo.context,
                timestamp: errorInfo.timestamp,
                id: errorInfo.id
            });
        }
    },

    // Track error metrics (could be extended to send to analytics)
    trackError(errorInfo) {
        // Store in session storage for debugging
        try {
            const errors = JSON.parse(sessionStorage.getItem('error_log') || '[]');
            errors.push(errorInfo);
            
            // Keep only last 50 errors
            if (errors.length > 50) {
                errors.splice(0, errors.length - 50);
            }
            
            sessionStorage.setItem('error_log', JSON.stringify(errors));
        } catch (e) {
            console.warn('Failed to track error in session storage:', e);
        }
    },

    // Generate unique error ID
    generateErrorId() {
        return 'err_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    },

    // Create specific error handlers
    createNetworkErrorHandler(context = {}) {
        return (error) => this.handleError(error, this.ERROR_CATEGORIES.NETWORK, context);
    },

    createValidationErrorHandler(context = {}) {
        return (error) => this.handleError(error, this.ERROR_CATEGORIES.VALIDATION, context);
    },

    createApiErrorHandler(context = {}) {
        return (error) => this.handleError(error, this.ERROR_CATEGORIES.API, context);
    },

    createUIErrorHandler(context = {}) {
        return (error) => this.handleError(error, this.ERROR_CATEGORIES.UI, context);
    },

    // Get error statistics
    getErrorStats() {
        try {
            const errors = JSON.parse(sessionStorage.getItem('error_log') || '[]');
            const stats = {
                total: errors.length,
                byCategory: {},
                recent: errors.slice(-10)
            };
            
            errors.forEach(error => {
                stats.byCategory[error.category] = (stats.byCategory[error.category] || 0) + 1;
            });
            
            return stats;
        } catch (e) {
            return { total: 0, byCategory: {}, recent: [] };
        }
    },

    // Clear error log
    clearErrorLog() {
        try {
            sessionStorage.removeItem('error_log');
        } catch (e) {
            console.warn('Failed to clear error log:', e);
        }
    }
};

// Logger utility for consistent logging
const Logger = {
    // Log levels
    levels: {
        ERROR: 0,
        WARN: 1,
        INFO: 2,
        DEBUG: 3
    },

    // Current log level (can be configured)
    currentLevel: 2, // INFO

    // Log methods
    error(message, context = {}) {
        this.log(message, this.levels.ERROR, context);
    },

    warn(message, context = {}) {
        this.log(message, this.levels.WARN, context);
    },

    info(message, context = {}) {
        this.log(message, this.levels.INFO, context);
    },

    debug(message, context = {}) {
        this.log(message, this.levels.DEBUG, context);
    },

    // Core logging method
    log(message, level, context = {}) {
        if (level > this.currentLevel) return;
        
        const timestamp = new Date().toISOString();
        const levelName = Object.keys(this.levels).find(key => this.levels[key] === level);
        
        const logEntry = {
            timestamp,
            level: levelName,
            message,
            context
        };
        
        // Log to console
        this.logToConsole(logEntry);
        
        // Log to UI if available and it's an error
        if (level === this.levels.ERROR && typeof logApi === 'function') {
            logApi({
                type: 'error',
                msg: message,
                context,
                timestamp
            });
        }
    },

    logToConsole(logEntry) {
        const prefix = `[${logEntry.timestamp}] [${logEntry.level}]`;
        
        switch (logEntry.level) {
            case 'ERROR':
                console.error(prefix, logEntry.message, logEntry.context);
                break;
            case 'WARN':
                console.warn(prefix, logEntry.message, logEntry.context);
                break;
            case 'INFO':
                console.info(prefix, logEntry.message, logEntry.context);
                break;
            case 'DEBUG':
                console.debug(prefix, logEntry.message, logEntry.context);
                break;
        }
    },

    // Set log level
    setLevel(level) {
        if (typeof level === 'string') {
            level = this.levels[level.toUpperCase()];
        }
        if (level !== undefined) {
            this.currentLevel = level;
        }
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ErrorHandler, Logger };
}
