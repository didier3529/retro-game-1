/**
 * AssetManager loads and caches game assets.
 *
 * Events:
 *   AssetsReady (CustomEvent): Fired when all assets are loaded and post-load integrity check completed.
 *   AssetProgress (CustomEvent): Fired after each asset load attempt.
 *     detail.key: string - asset key
 *     detail.loaded: number - number of assets loaded so far
 *     detail.total: number - total assets to load
 *     detail.error: Error (optional) - error object if loading failed
 *   AssetError (CustomEvent): Fired when an asset fails to load or is missing in post-load check.
 *     detail.key: string - asset key
 *     detail.error: Error - error raised
 */
class AssetManager extends EventTarget {
  constructor(options = {}) {
    super();
    this.options = {
      basePaths: { image: 'assets/images/', audio: 'assets/audio/', json: 'assets/data/' },
      concurrency: 5,
      retry: 2,
      retryDelay: 1000,
      placeholders: {},
      ...options
    };
    this.cache = new Map();
    this.refCount = new Map();
    this.manifest = [];
    this._queue = [];
    this._active = 0;
    this._loaded = 0;
    this._total = 0;
  }

  configure(options) {
    Object.assign(this.options, options);
  }

  setManifest(manifest) {
    if (Array.isArray(manifest)) {
      this.manifest = manifest;
    } else if (typeof manifest === 'object') {
      this.manifest = Object.keys(manifest).map(key => {
        const val = manifest[key];
        if (typeof val === 'string') {
          return { key, url: val, type: this._deduceType(val) };
        }
        return { key, url: val.url, type: val.type || this._deduceType(val.url) };
      });
    }
  }

  loadAll(manifest) {
    if (manifest) this.setManifest(manifest);
    if (!this.manifest.length) return Promise.reject(new Error('AssetManager: No manifest to load'));
    this._queue = [...this.manifest];
    this._total = this._queue.length;
    this._loaded = 0;
    return new Promise((resolve) => {
      for (let i = 0; i < this.options.concurrency; i++) {
        this._next(resolve);
      }
    });
  }

  _next(resolve) {
    if (this._queue.length === 0 && this._active === 0) {
      this.dispatchEvent(new CustomEvent('AssetsReady'));
      this._postLoadIntegrityCheck();
      resolve();
      return;
    }
    if (this._queue.length === 0 || this._active >= this.options.concurrency) return;
    const descriptor = this._queue.shift();
    this._active++;
    this._loadWithRetry(descriptor, this.options.retry)
      .then(asset => {
        this.cache.set(descriptor.key, asset);
        this.refCount.set(descriptor.key, 1);
        this._loaded++;
        this.dispatchEvent(new CustomEvent('AssetProgress', {
          detail: { key: descriptor.key, loaded: this._loaded, total: this._total }
        }));
      })
      .catch(err => {
        console.warn(`AssetManager: Failed to load ${descriptor.key} from ${descriptor.url}`, err);
        // emit error event
        this.dispatchEvent(new CustomEvent('AssetError', {
          detail: { key: descriptor.key, error: err }
        }));
        const placeholder = this.options.placeholders[descriptor.type];
        if (placeholder) {
          this.cache.set(descriptor.key, placeholder);
          this.refCount.set(descriptor.key, 1);
        }
        this._loaded++;
        this.dispatchEvent(new CustomEvent('AssetProgress', {
          detail: { key: descriptor.key, loaded: this._loaded, total: this._total, error: err }
        }));
      })
      .finally(() => {
        this._active--;
        this._next(resolve);
      });
  }

  _postLoadIntegrityCheck() {
    const missing = this.manifest.map(d => d.key).filter(key => !this.cache.has(key));
    if (missing.length) {
      missing.forEach(key => {
        const error = new Error(`Missing asset: ${key}`);
        this.dispatchEvent(new CustomEvent('AssetError', {
          detail: { key, error }
        }));
      });
      console.error(`AssetManager: Integrity check failed, missing assets: ${missing.join(', ')}`);
    }
  }

  _loadWithRetry(descriptor, retries) {
    return this._loadAsset(descriptor)
      .catch(err => {
        if (retries > 0) {
          return new Promise(res => setTimeout(res, this.options.retryDelay))
            .then(() => this._loadWithRetry(descriptor, retries - 1));
        }
        return Promise.reject(err);
      });
  }

  _loadAsset({ url, type }) {
    const fullUrl = this.options.basePaths[type] ? this.options.basePaths[type] + url : url;
    switch (type) {
      case 'image':
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = fullUrl;
        });
      case 'audio':
        return new Promise((resolve, reject) => {
          const audio = new Audio();
          audio.onloadeddata = () => resolve(audio);
          audio.onerror = reject;
          audio.src = fullUrl;
        });
      case 'json':
        return fetch(fullUrl).then(resp => {
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          return resp.json();
        });
      default:
        return fetch(fullUrl).then(resp => {
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          return resp.blob();
        });
    }
  }

  _deduceType(url) {
    const ext = url.split('.').pop().toLowerCase();
    if (['png','jpg','jpeg','gif','webp'].includes(ext)) return 'image';
    if (['mp3','wav','ogg','m4a'].includes(ext)) return 'audio';
    if (['json'].includes(ext)) return 'json';
    return 'blob';
  }

  get(key) {
    return this.cache.get(key);
  }

  release(key) {
    const count = this.refCount.get(key) || 0;
    if (count > 1) {
      this.refCount.set(key, count - 1);
    } else {
      this.refCount.delete(key);
      const asset = this.cache.get(key);
      if (asset instanceof HTMLImageElement) asset.src = '';
      if (asset instanceof HTMLAudioElement) asset.src = '';
      this.cache.delete(key);
    }
  }

  clear() {
    for (const key of Array.from(this.cache.keys())) {
      this.release(key);
    }
    this.cache.clear();
    this.refCount.clear();
    this.manifest = [];
    this._queue = [];
    this._active = 0;
    this._loaded = 0;
    this._total = 0;
  }
}

const assetmanager = new AssetManager();
export default assetmanager;