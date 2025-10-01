import { eventBus } from './EventBus.js';
import storagemanager from './StorageManager.js';

class SettingsManager {
    constructor() {
        this._schema = {
            'audio.masterVolume': { type: 'number', default: 1, validate: v => typeof v === 'number' && v >= 0 && v <= 1 },
            'audio.musicVolume': { type: 'number', default: 1, validate: v => typeof v === 'number' && v >= 0 && v <= 1 },
            'audio.sfxVolume': { type: 'number', default: 1, validate: v => typeof v === 'number' && v >= 0 && v <= 1 },
            'audio.muted': { type: 'boolean', default: false },
            'debugOverlay': { type: 'boolean', default: false },
            'adAppId': { type: 'string', default: '' },
            'iapProductIds': { type: 'object', default: [] }
        };
        this._settings = {};
        this._changeHandlers = [];
    }

    async load() {
        await storagemanager.sync();
        let stored = storagemanager.getItem('settings');
        stored = stored && typeof stored === 'object' ? stored : {};
        for (const key in this._schema) {
            const { default: def, validate, type } = this._schema[key];
            const hasStored = Object.prototype.hasOwnProperty.call(stored, key);
            const val = hasStored ? stored[key] : undefined;
            if (val !== undefined) {
                const isValid = validate ? validate(val) : typeof val === type;
                if (isValid) {
                    this._settings[key] = this._clone(def, val);
                } else {
                    console.warn(`Invalid setting ${key}:`, val);
                    this._settings[key] = this._clone(def);
                }
            } else {
                this._settings[key] = this._clone(def);
            }
        }
        this.save();
        eventBus.emit('SettingsReady');
    }

    save() {
        try {
            storagemanager.setItem('settings', this._settings);
            storagemanager.commitAll();
        } catch (e) {
            console.error('SettingsManager: save failed', e);
        }
    }

    get(key) {
        if (!this._schema[key]) {
            console.warn(`SettingsManager: Unknown setting "${key}"`);
        }
        return this._settings[key];
    }

    set(key, value) {
        const entry = this._schema[key];
        if (!entry) {
            console.error(`SettingsManager: Cannot set unknown setting "${key}"`);
            return;
        }
        if (entry.validate && !entry.validate(value)) {
            console.error(`SettingsManager: Validation failed for "${key}"`, value);
            return;
        }
        this._settings[key] = value;
        this.save();
        this._emitChange(key, value);
    }

    reset(key) {
        if (key) {
            const entry = this._schema[key];
            if (!entry) {
                console.warn(`SettingsManager: Cannot reset unknown setting "${key}"`);
                return;
            }
            this._settings[key] = this._clone(entry.default);
            this.save();
            this._emitChange(key, this._settings[key]);
        } else {
            for (const k in this._schema) {
                this._settings[k] = this._clone(this._schema[k].default);
                this._emitChange(k, this._settings[k]);
            }
            this.save();
        }
    }

    on(event, handler) {
        if (event === 'change') {
            this._changeHandlers.push(handler);
        } else {
            eventBus.on(event, handler);
        }
    }

    off(event, handler) {
        if (event === 'change') {
            const idx = this._changeHandlers.indexOf(handler);
            if (idx >= 0) this._changeHandlers.splice(idx, 1);
        } else {
            eventBus.off(event, handler);
        }
    }

    _emitChange(key, value) {
        for (const fn of this._changeHandlers) {
            try { fn(key, value); } catch (e) { console.error(e); }
        }
        eventBus.emit('SettingsChanged', { key, value });
    }

    _clone(defaultVal, overrideVal) {
        let v = overrideVal !== undefined ? overrideVal : defaultVal;
        if (Array.isArray(defaultVal)) {
            return Array.isArray(v) ? v.slice() : defaultVal.slice();
        }
        if (defaultVal && typeof defaultVal === 'object') {
            return typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : JSON.parse(JSON.stringify(defaultVal));
        }
        return v;
    }
}

const settingsmanager = new SettingsManager();
eventBus.on('AssetsReady', () => settingsmanager.load());
export default settingsmanager;