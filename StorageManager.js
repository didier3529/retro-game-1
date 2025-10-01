/**
 * StorageManager provides a unified interface over localStorage (with in-memory fallback)
 * for persisting and retrieving data with versioning and migration capabilities.
 *
 * Events:
 *   StorageReady (CustomEvent): Fired after sync() completes.
 *   StorageCommitted (CustomEvent): Fired after commitAll() completes.
 *   StorageError (CustomEvent): Fired when an operation fails (detail: Error).
 *
 * @extends {EventTarget}
 */
class StorageManager extends EventTarget {
    constructor() {
        super();
        this.supported = this._detectSupport();
        this.storage = this.supported ? window.localStorage : null;
        this.cache = {};
        this.buffer = {};
        this.removals = new Set();
        this.currentVersion = 1;
        this.versionKey = '__storage_version';
        this.migrations = {};
    }

    _detectSupport() {
        try {
            const testKey = '__storage_test';
            window.localStorage.setItem(testKey, '1');
            window.localStorage.removeItem(testKey);
            return true;
        } catch (e) {
            console.warn('localStorage not supported, using in-memory fallback', e);
            return false;
        }
    }

    /**
     * Synchronize the in-memory cache with persistent storage, applying migrations if needed.
     * Emits 'StorageReady' event when done.
     * @returns {Promise<void>}
     */
    async sync() {
        try {
            if (this.supported) {
                const storedVersionRaw = this.storage.getItem(this.versionKey);
                let storedVersion = parseInt(storedVersionRaw, 10);
                if (isNaN(storedVersion)) storedVersion = 0;
                for (let i = 0; i < this.storage.length; i++) {
                    const key = this.storage.key(i);
                    if (key === this.versionKey) continue;
                    const raw = this.storage.getItem(key);
                    try {
                        this.cache[key] = JSON.parse(raw);
                    } catch {
                        this.cache[key] = raw;
                    }
                }
                if (storedVersion < this.currentVersion) {
                    for (let v = storedVersion + 1; v <= this.currentVersion; v++) {
                        const migrate = this.migrations[v];
                        if (typeof migrate === 'function') migrate(this.cache);
                    }
                    this.cache[this.versionKey] = this.currentVersion;
                    this.buffer[this.versionKey] = this.currentVersion;
                }
            }
        } catch (e) {
            this.supported = false;
            this.dispatchEvent(new CustomEvent('StorageError', { detail: e }));
        }
        this.dispatchEvent(new CustomEvent('StorageReady'));
    }

    /**
     * Persist all buffered changes to storage, handling removals, and clear buffer.
     * Emits 'StorageCommitted' event when done.
     * @returns {Promise<void>}
     */
    async commitAll() {
        try {
            if (this.supported) {
                for (const key of this.removals) {
                    this.storage.removeItem(key);
                }
                this.removals.clear();
                for (const key in this.buffer) {
                    try {
                        this.storage.setItem(key, JSON.stringify(this.buffer[key]));
                    } catch (e) {
                        console.error(`StorageManager: Failed to setItem ${key}`, e);
                    }
                }
                this.buffer = {};
            }
        } catch (e) {
            this.supported = false;
            this.dispatchEvent(new CustomEvent('StorageError', { detail: e }));
        }
        this.dispatchEvent(new CustomEvent('StorageCommitted'));
    }

    /**
     * Retrieve an item from the storage cache.
     * @param {string} key
     * @returns {*|null} The stored value, or null if not found.
     */
    getItem(key) {
        return Object.prototype.hasOwnProperty.call(this.cache, key) ? this.cache[key] : null;
    }

    /**
     * Buffer a value to be stored on next commit and update cache.
     * @param {string} key
     * @param {*} value
     * @returns {void}
     */
    setItem(key, value) {
        this.cache[key] = value;
        this.buffer[key] = value;
        if (this.removals.has(key)) this.removals.delete(key);
    }

    /**
     * Remove an item from cache and mark for deletion on next commit.
     * @param {string} key
     * @returns {void}
     */
    removeItem(key) {
        if (Object.prototype.hasOwnProperty.call(this.cache, key)) {
            delete this.cache[key];
        }
        this.removals.add(key);
        if (Object.prototype.hasOwnProperty.call(this.buffer, key)) {
            delete this.buffer[key];
        }
    }

    /**
     * Clear all data from storage and in-memory cache and buffers.
     * Emits 'StorageCommitted' event when done.
     * @returns {void}
     */
    clear() {
        if (this.supported) {
            try {
                this.storage.clear();
            } catch (e) {
                this.supported = false;
                this.dispatchEvent(new CustomEvent('StorageError', { detail: e }));
            }
        }
        this.cache = {};
        this.buffer = {};
        this.removals.clear();
        this.dispatchEvent(new CustomEvent('StorageCommitted'));
    }

    /**
     * Get all keys currently stored in the cache.
     * @returns {string[]} Array of keys.
     */
    keys() {
        return Object.keys(this.cache);
    }
}

const storagemanager = new StorageManager();

/**
 * Subscribe to storage manager events.
 * @param {string} type - Event type ('StorageReady', 'StorageCommitted', 'StorageError').
 * @param {Function} listener - Event listener callback.
 */
function on(type, listener) {
    storagemanager.addEventListener(type, listener, { passive: true });
}

/**
 * Unsubscribe from storage manager events.
 * @param {string} type - Event type.
 * @param {Function} listener - Event listener callback.
 */
function off(type, listener) {
    storagemanager.removeEventListener(type, listener);
}

document.addEventListener('DOMContentLoaded', () => {
    storagemanager.sync();
}, { once: true, passive: true });

export default storagemanager;
export { on, off };