import { } from './AssetManager.js';

class AudioManager {
    constructor() {
        this.audioContext = null;
        this.masterGain = null;
        this.categoryGains = {};
        this.buffers = new Map();
        this.activeSources = new Map();
        this.defaultVolumes = { master: 1, music: 1, sfx: 1 };
        this.mutedCategories = new Set();
        this.crossfadeDuration = 1.0;
    }

    async init() {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) {
            console.error('Web Audio API is not supported in this browser');
            return;
        }
        this.audioContext = new AudioCtx();

        const unlock = () => {
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume().catch(() => {});
            }
            document.body.removeEventListener('touchstart', unlock);
            document.body.removeEventListener('click', unlock);
        };
        document.body.addEventListener('touchstart', unlock, { passive: true });
        document.body.addEventListener('click', unlock, { passive: true });

        this.masterGain = this.audioContext.createGain();
        this.masterGain.gain.value = this.defaultVolumes.master;
        this.masterGain.connect(this.audioContext.destination);

        ['music', 'sfx'].forEach(cat => {
            const gainNode = this.audioContext.createGain();
            gainNode.gain.value = this.defaultVolumes[cat];
            gainNode.connect(this.masterGain);
            this.categoryGains[cat] = gainNode;
        });

        // I2: signal readiness
        document.dispatchEvent(new CustomEvent('AudioReady'));

        this._setupEventListeners();

        // I3: resume or start music on GameStart
        window.addEventListener('GameStart', () => {
            if (this.audioContext && this.audioContext.state === 'suspended') {
                this.audioContext.resume().catch(() => {});
            }
        }, { passive: true });

        // I4: play spawn SFX on WaveSpawned
        window.addEventListener('WaveSpawned', () => {
            this.playSound('waveSpawn', { category: 'sfx' });
        }, { passive: true });
    }

    _setupEventListeners() {
        window.addEventListener('PlaySFX', e => {
            const d = e.detail || {};
            this.playSound(d.name, { loop: d.loop, volume: d.volume, category: 'sfx', onEnd: d.onEnd });
        }, { passive: true });

        window.addEventListener('PlayMusic', e => {
            const d = e.detail || {};
            this.playSound(d.name, { loop: d.loop === undefined ? true : d.loop, volume: d.volume, category: 'music', onEnd: d.onEnd });
        }, { passive: true });

        window.addEventListener('GamePause', () => this.pauseAll(), { passive: true });
        window.addEventListener('GameResume', () => this.resumeAll(), { passive: true });
        window.addEventListener('GameOver', () => this.stopAll(), { passive: true });
    }

    async load(name, url, category = 'sfx') {
        if (!this.audioContext) {
            console.warn('AudioContext not initialized');
            return;
        }
        if (this.buffers.has(name)) return;
        try {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`Failed to load audio ${name}`);
            const arrayBuf = await resp.arrayBuffer();
            const audioBuf = await this.audioContext.decodeAudioData(arrayBuf);
            this.buffers.set(name, { buffer: audioBuf, category });
        } catch (err) {
            console.error(`Error loading audio "${name}":`, err);
        }
    }

    playSound(name, { loop = false, volume = 1, category, onEnd } = {}) {
        if (!this.audioContext) {
            console.warn('AudioContext not initialized');
            return;
        }
        if (!this.buffers.has(name)) {
            console.warn(`Audio buffer "${name}" not found`);
            return;
        }
        const entry = this.buffers.get(name);
        const cat = category || entry.category || 'sfx';
        const buf = entry.buffer;
        const source = this.audioContext.createBufferSource();
        source.buffer = buf;
        source.loop = loop;
        const gainNode = this.audioContext.createGain();
        gainNode.gain.value = volume;
        source.connect(gainNode).connect(this.categoryGains[cat] || this.masterGain);
        const sources = this.activeSources.get(name) || new Set();
        sources.add(source);
        this.activeSources.set(name, sources);
        source.onended = () => {
            sources.delete(source);
            if (sources.size === 0) this.activeSources.delete(name);
            if (typeof onEnd === 'function') onEnd();
        };
        source.start(0);
        return source;
    }

    pauseAll() {
        if (this.audioContext && this.audioContext.state === 'running') {
            this.audioContext.suspend().catch(() => {});
        }
    }

    resumeAll() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch(() => {});
        }
    }

    stopAll() {
        for (const sources of this.activeSources.values()) {
            for (const src of sources) {
                try { src.stop(); } catch {}
            }
        }
        this.activeSources.clear();
    }

    stopSound(name) {
        if (!this.activeSources.has(name)) return;
        for (const src of this.activeSources.get(name)) {
            try { src.stop(); } catch {}
        }
        this.activeSources.delete(name);
    }

    setVolume(value, category = 'master') {
        if (category === 'master') {
            this.masterGain.gain.value = value;
        } else if (this.categoryGains[category]) {
            this.categoryGains[category].gain.value = value;
        } else {
            console.warn(`Unknown category "${category}" for setVolume`);
        }
    }

    mute(category = 'master') {
        this.mutedCategories.add(category);
        if (category === 'master') {
            this.masterGain.gain.value = 0;
        } else if (this.categoryGains[category]) {
            this.categoryGains[category].gain.value = 0;
        }
    }

    unmute(category = 'master') {
        this.mutedCategories.delete(category);
        if (category === 'master') {
            this.masterGain.gain.value = this.defaultVolumes.master;
        } else if (this.categoryGains[category]) {
            this.categoryGains[category].gain.value = this.defaultVolumes[category] || 1;
        }
    }

    unload(name) {
        if (this.buffers.has(name)) {
            this.buffers.delete(name);
        }
        if (this.activeSources.has(name)) {
            for (const src of this.activeSources.get(name)) {
                try { src.stop(); } catch {}
            }
            this.activeSources.delete(name);
        }
    }

    config(options = {}) {
        if (options.defaultVolumes) {
            Object.assign(this.defaultVolumes, options.defaultVolumes);
        }
        if (options.crossfadeDuration !== undefined) {
            this.crossfadeDuration = options.crossfadeDuration;
        }
    }
}

const audioManager = new AudioManager();
document.addEventListener('DOMContentLoaded', () => audioManager.init());
export default audioManager;