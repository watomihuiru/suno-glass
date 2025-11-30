// DOM utilities for optimized DOM queries and event management
class DOMUtils {
    // Cache for frequently accessed DOM elements
    static cache = new Map();

    // Get DOM element with caching
    static get(selector, useCache = true) {
        if (useCache && this.cache.has(selector)) {
            const cached = this.cache.get(selector);
            // Verify element is still in DOM
            if (cached && document.contains(cached)) {
                return cached;
            }
            this.cache.delete(selector);
        }

        const element = document.querySelector(selector);
        if (useCache && element) {
            this.cache.set(selector, element);
        }
        return element;
    }

    // Get multiple DOM elements
    static getAll(selector) {
        return document.querySelectorAll(selector);
    }

    // Clear cache (useful for SPA navigation)
    static clearCache() {
        this.cache.clear();
    }

    // Batch DOM operations for better performance
    static batch(operations) {
        // Use document fragment for multiple insertions
        const fragment = document.createDocumentFragment();
        
        operations.forEach(operation => {
            if (operation.type === 'create') {
                const element = this.createElement(operation);
                if (operation.parent) {
                    fragment.appendChild(element);
                }
            }
        });

        if (fragment.children.length > 0) {
            const firstOperation = operations.find(op => op.parent);
            if (firstOperation) {
                this.get(firstOperation.parent).appendChild(fragment);
            }
        }
    }

    // Create element with properties
    static createElement(config) {
        const element = document.createElement(config.tag);
        
        // Set attributes
        if (config.attributes) {
            Object.entries(config.attributes).forEach(([key, value]) => {
                element.setAttribute(key, value);
            });
        }

        // Set properties
        if (config.properties) {
            Object.entries(config.properties).forEach(([key, value]) => {
                element[key] = value;
            });
        }

        // Set styles
        if (config.styles) {
            Object.entries(config.styles).forEach(([key, value]) => {
                element.style[key] = value;
            });
        }

        // Add classes
        if (config.classes) {
            if (Array.isArray(config.classes)) {
                element.classList.add(...config.classes);
            } else {
                element.classList.add(config.classes);
            }
        }

        // Set content
        if (config.text) {
            element.textContent = config.text;
        } else if (config.html) {
            element.innerHTML = config.html;
        }

        // Append children
        if (config.children) {
            config.children.forEach(child => {
                if (typeof child === 'string') {
                    element.appendChild(document.createTextNode(child));
                } else {
                    element.appendChild(child);
                }
            });
        }

        return element;
    }

    // Debounce function for event handlers
    static debounce(func, wait, immediate = false) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                timeout = null;
                if (!immediate) func(...args);
            };
            const callNow = immediate && !timeout;
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
            if (callNow) func(...args);
        };
    }

    // Throttle function for event handlers
    static throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    // Event delegation helper
    static delegate(parent, selector, event, handler) {
        const parentElement = this.get(parent);
        parentElement.addEventListener(event, (e) => {
            if (e.target.matches(selector)) {
                handler(e);
            } else if (e.target.closest(selector)) {
                handler(e);
            }
        });
    }

    // Add event listener with automatic cleanup
    static addListener(element, event, handler, options = {}) {
        const el = typeof element === 'string' ? this.get(element) : element;
        
        if (!el) return null;

        const wrappedHandler = options.once ? 
            (e) => {
                handler(e);
                el.removeEventListener(event, wrappedHandler);
            } : handler;

        el.addEventListener(event, wrappedHandler, options);

        // Return cleanup function
        return () => {
            el.removeEventListener(event, wrappedHandler);
        };
    }

    // Remove multiple event listeners
    static removeListeners(element, events) {
        const el = typeof element === 'string' ? this.get(element) : element;
        if (!el) return;

        events.forEach(event => {
            const listeners = el.getEventListeners ? el.getEventListeners(event) : [];
            listeners.forEach(listener => {
                el.removeEventListener(event, listener.listener);
            });
        });
    }

    // Wait for element to appear in DOM
    static waitFor(selector, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const element = this.get(selector);
            if (element) {
                resolve(element);
                return;
            }

            const observer = new MutationObserver((mutations, obs) => {
                const element = this.get(selector, false); // Don't use cache for waiting
                if (element) {
                    obs.disconnect();
                    resolve(element);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            setTimeout(() => {
                observer.disconnect();
                reject(new Error(`Element ${selector} not found within ${timeout}ms`));
            }, timeout);
        });
    }

    // Check if element is visible in viewport
    static isVisible(element) {
        const el = typeof element === 'string' ? this.get(element) : element;
        if (!el) return false;

        const rect = el.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
    }

    // Smooth scroll to element
    static scrollTo(element, options = {}) {
        const el = typeof element === 'string' ? this.get(element) : element;
        if (!el) return;

        el.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
            inline: 'nearest',
            ...options
        });
    }

    // Measure element dimensions
    static getDimensions(element) {
        const el = typeof element === 'string' ? this.get(element) : element;
        if (!el) return { width: 0, height: 0 };

        const rect = el.getBoundingClientRect();
        return {
            width: rect.width,
            height: rect.height,
            top: rect.top,
            left: rect.left,
            right: rect.right,
            bottom: rect.bottom
        };
    }

    // Toggle element visibility
    static toggle(element, force) {
        const el = typeof element === 'string' ? this.get(element) : element;
        if (!el) return;

        if (force !== undefined) {
            el.style.display = force ? '' : 'none';
        } else {
            el.style.display = el.style.display === 'none' ? '' : 'none';
        }
    }

    // Add/remove classes with better performance
    static toggleClass(element, className, force) {
        const el = typeof element === 'string' ? this.get(element) : element;
        if (!el) return;

        if (force !== undefined) {
            el.classList.toggle(className, force);
        } else {
            el.classList.toggle(className);
        }
    }

    // Set multiple styles at once
    static setStyles(element, styles) {
        const el = typeof element === 'string' ? this.get(element) : element;
        if (!el) return;

        Object.entries(styles).forEach(([property, value]) => {
            el.style[property] = value;
        });
    }

    // Animate element with CSS transitions
    static animate(element, styles, duration = 300, easing = 'ease') {
        const el = typeof element === 'string' ? this.get(element) : element;
        if (!el) return Promise.resolve();

        return new Promise(resolve => {
            // Store original transition
            const originalTransition = el.style.transition;
            
            // Set new transition
            el.style.transition = `all ${duration}ms ${easing}`;
            
            // Apply styles
            this.setStyles(el, styles);
            
            // Listen for transition end
            const handleTransitionEnd = () => {
                el.style.transition = originalTransition;
                el.removeEventListener('transitionend', handleTransitionEnd);
                resolve();
            };
            
            el.addEventListener('transitionend', handleTransitionEnd);
            
            // Fallback timeout
            setTimeout(() => {
                el.removeEventListener('transitionend', handleTransitionEnd);
                resolve();
            }, duration + 50);
        });
    }
}

// Event Manager for centralized event handling
class EventManager {
    constructor() {
        this.listeners = new Map();
    }

    // Add event listener with automatic cleanup
    on(element, event, handler, options = {}) {
        const key = this.getKey(element, event);
        const cleanup = DOMUtils.addListener(element, event, handler, options);
        
        if (!this.listeners.has(key)) {
            this.listeners.set(key, []);
        }
        this.listeners.get(key).push(cleanup);
        
        return cleanup;
    }

    // Remove specific event listener
    off(element, event, handler) {
        const key = this.getKey(element, event);
        const cleanups = this.listeners.get(key) || [];
        
        cleanups.forEach(cleanup => cleanup());
        this.listeners.delete(key);
    }

    // Remove all event listeners
    removeAll() {
        this.listeners.forEach(cleanups => {
            cleanups.forEach(cleanup => cleanup());
        });
        this.listeners.clear();
    }

    // Generate key for event listener storage
    getKey(element, event) {
        const el = typeof element === 'string' ? DOMUtils.get(element) : element;
        return `${el.tagName}_${el.id || el.className || 'unnamed'}_${event}`;
    }
}

// Create global instances
const eventManager = new EventManager();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DOMUtils, EventManager, eventManager };
}
