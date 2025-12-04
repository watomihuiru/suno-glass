// Credits management module
const CreditsManager = {
    // DOM elements
    elements: {
        creditsValue: null,
        creditsAmount: null,
        creditsStatus: null,
        refreshBtn: null
    },

    // State
    currentCredits: null,
    lastUpdate: null,
    refreshInterval: null,

    // Initialize credits manager
    init() {
        this.cacheElements();
        this.bindEvents();

        // Request initial credits check
        this.requestCreditsUpdate();
    },

    // Cache DOM elements
    cacheElements() {
        this.elements.creditsValue = document.getElementById('creditsValue');
        this.elements.creditsAmount = document.getElementById('creditsAmount');
        this.elements.creditsStatus = document.getElementById('creditsStatus');
    },

    // Bind socket events
    bindEvents() {
        // Wait for socket to be available
        if (typeof socket === 'undefined') {
            setTimeout(() => this.bindEvents(), 500);
            return;
        }

        // Listen for credits updates from server
        socket.on('credits_update', (data) => {
            this.updateCreditsDisplay(data.credits, data.timestamp);
        });

        // Listen for credits errors
        socket.on('credits_error', (data) => {
            this.showError(data.error);
        });

        // Listen for task creation to refresh credits
        socket.on('task_created', () => {
            // Refresh credits when task is created (after generation button click)
            setTimeout(() => this.requestCreditsUpdate(), 100);
        });

        // Listen for task completion to refresh credits
        socket.on('task_update', (data) => {
            if (data.status === 'SUCCESS' || data.status === 'FAILED' || data.status === 'ERROR') {
                // Refresh credits only on final success or failure
                setTimeout(() => this.requestCreditsUpdate(), 500);
            }
        });

        // Listen for task failed creation (error) to refresh credits
        socket.on('task_failed_creation', () => {
            // Refresh credits when task fails to create
            setTimeout(() => this.requestCreditsUpdate(), 500);
        });

        // Listen for API errors that might affect credits
        socket.on('error_message', (msg) => {
            if (msg.includes('credits') || msg.includes('402')) {
                // Refresh credits on credit-related errors
                setTimeout(() => this.requestCreditsUpdate(), 500);
            }
        });
    },

    // Request credits update from server
    requestCreditsUpdate() {
        this.setLoadingState();

        if (typeof socket === 'undefined') {
            this.showError('Socket not available');
            return;
        }

        socket.emit('get_credits');
    },

    // Update credits display
    updateCreditsDisplay(credits, timestamp) {
        // Handle both number and object formats
        let creditValue = credits;
        if (typeof credits === 'object' && credits !== null) {
            creditValue = credits.credits || credits.quantity || credits.data || 0;
        }

        // Ensure we have a number
        creditValue = parseInt(creditValue) || 0;

        this.currentCredits = creditValue;
        this.lastUpdate = timestamp;

        // Update value
        this.elements.creditsValue.textContent = creditValue.toLocaleString();

        // Update status based on credit amount
        this.updateCreditStatus(creditValue);


    },

    // Update credit status styling and text
    updateCreditStatus(credits) {
        const statusEl = this.elements.creditsStatus;

        if (credits === 0) {
            statusEl.className = 'credits-status error';
            statusEl.innerHTML = `
                <i class="fa-solid fa-exclamation-triangle"></i>
                <span>No credits</span>
            `;
        } else if (credits < 10) {
            statusEl.className = 'credits-status warning';
            statusEl.innerHTML = `
                <i class="fa-solid fa-battery-quarter"></i>
                <span>Low</span>
            `;
        } else {
            statusEl.className = 'credits-status success';
            statusEl.innerHTML = `
                <i class="fa-solid fa-check-circle"></i>
                <span>Available</span>
            `;
        }
    },

    // Set loading state
    setLoadingState() {
        this.elements.creditsValue.textContent = '--';
        this.elements.creditsStatus.className = 'credits-status';
        this.elements.creditsStatus.innerHTML = `
            <i class="fa-solid fa-spinner fa-spin"></i>
            <span>Checking...</span>
        `;
    },

    // Show error state
    showError(error) {
        this.elements.creditsValue.textContent = '??';
        this.elements.creditsStatus.className = 'credits-status error';
        this.elements.creditsStatus.innerHTML = `
            <i class="fa-solid fa-exclamation-circle"></i>
            <span>Error</span>
        `;

        // Log error
        if (window.logApi) {
            logApi({
                type: 'error',
                msg: `Credits check failed: ${error}`,
                timestamp: new Date().toISOString()
            });
        }
    },

    // Auto refresh is disabled - credits are updated on API events only
    // startAutoRefresh() method removed as credits update on API request/response

    // Check if user has enough credits for operation
    hasEnoughCredits(required = 1) {
        return this.currentCredits !== null && this.currentCredits >= required;
    },

    // Get current credits
    getCurrentCredits() {
        return this.currentCredits;
    },

    // Force refresh
    refresh() {
        this.requestCreditsUpdate();
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    CreditsManager.init();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CreditsManager;
}
