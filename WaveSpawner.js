import gameloopmanager from './GameLoopManager.js';

function isValidWave(w) {
    return w && typeof w === 'object'
        && Number.isInteger(w.asteroids) && w.asteroids >= 0
        && Number.isInteger(w.enemies) && w.enemies >= 0
        && typeof w.interval === 'number' && w.interval > 0
        && typeof w.waveDelay === 'number' && w.waveDelay >= 0;
}

class WaveSpawner {
    constructor() {
        this.defaultConfigs = [
            { asteroids: 5, enemies: 0, interval: 2000, waveDelay: 0 },
            { asteroids: 8, enemies: 1, interval: 1800, waveDelay: 5000 },
            { asteroids: 10, enemies: 2, interval: 1600, waveDelay: 5000 },
            { asteroids: 12, enemies: 3, interval: 1400, waveDelay: 5000 },
            { asteroids: 15, enemies: 4, interval: 1200, waveDelay: 5000 }
        ];
        this.customConfigs = null;
        this.currentWave = 0;
        this.waveConfig = null;
        this.spawnTimer = 0;
        this.waveDelayTimer = 0;
        this.toSpawnAsteroids = 0;
        this.toSpawnEnemies = 0;
        this.paused = false;

        this.update = this.update.bind(this);
        this._onGameStart = this.start.bind(this);
        this._onGamePause = this.pause.bind(this);
        this._onGameResume = this.resume.bind(this);
        this._onGameOver = this.abort.bind(this);
    }

    configure(wavesConfig) {
        if (!Array.isArray(wavesConfig) || !wavesConfig.every(isValidWave)) {
            console.warn('WaveSpawner: invalid configuration, falling back to defaults');
            this.customConfigs = null;
            return;
        }
        this.customConfigs = wavesConfig.map(w => ({ ...w }));
    }

    init() {
        gameloopmanager.registerUpdate(this.update);
        document.addEventListener('GameStart', this._onGameStart, { passive: true });
        document.addEventListener('GamePause', this._onGamePause, { passive: true });
        document.addEventListener('GameResume', this._onGameResume, { passive: true });
        document.addEventListener('GameOver', this._onGameOver, { passive: true });
        document.dispatchEvent(new CustomEvent('WaveSpawnerReady'));
    }

    start() {
        this.abort();
        this.paused = false;
        this.nextWave();
    }

    pause() {
        this.paused = true;
    }

    resume() {
        this.paused = false;
    }

    abort() {
        gameloopmanager.unregisterUpdate(this.update);
        document.removeEventListener('GameStart', this._onGameStart);
        document.removeEventListener('GamePause', this._onGamePause);
        document.removeEventListener('GameResume', this._onGameResume);
        document.removeEventListener('GameOver', this._onGameOver);
        this.currentWave = 0;
        this.waveConfig = null;
        this.spawnTimer = 0;
        this.waveDelayTimer = 0;
        this.toSpawnAsteroids = 0;
        this.toSpawnEnemies = 0;
        this.paused = true;
    }

    nextWave() {
        this.currentWave++;
        this.waveConfig = this.getConfig(this.currentWave);
        this.toSpawnAsteroids = this.waveConfig.asteroids;
        this.toSpawnEnemies = this.waveConfig.enemies;
        this.spawnTimer = 0;
        this.waveDelayTimer = this.waveConfig.waveDelay;
        if (this.waveDelayTimer <= 0) {
            window.dispatchEvent(new CustomEvent('WaveSpawned', { detail: { wave: this.currentWave } }));
        }
    }

    getConfig(n) {
        const configs = this.customConfigs || this.defaultConfigs;
        if (n <= configs.length) {
            return configs[n - 1];
        }
        const asteroids = 5 + n * 2;
        const enemies = Math.floor(n / 2);
        const interval = Math.max(500, 2000 - n * 100);
        const waveDelay = 5000;
        return { asteroids, enemies, interval, waveDelay };
    }

    update(dt) {
        if (this.paused || !this.waveConfig) return;

        if (this.waveDelayTimer > 0) {
            this.waveDelayTimer -= dt;
            if (this.waveDelayTimer <= 0) {
                window.dispatchEvent(new CustomEvent('WaveSpawned', { detail: { wave: this.currentWave } }));
                this.spawnTimer = 0;
            }
            return;
        }

        if (this.toSpawnAsteroids <= 0 && this.toSpawnEnemies <= 0) {
            this.nextWave();
            return;
        }

        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
            if (this.toSpawnAsteroids > 0) {
                this.spawnAsteroid();
                this.toSpawnAsteroids--;
            } else if (this.toSpawnEnemies > 0) {
                this.spawnEnemy();
                this.toSpawnEnemies--;
            }
            this.spawnTimer = this.waveConfig.interval * (0.8 + Math.random() * 0.4);
        }
    }

    spawnAsteroid() {
        window.dispatchEvent(new CustomEvent('SpawnAsteroid', { detail: { wave: this.currentWave } }));
    }

    spawnEnemy() {
        window.dispatchEvent(new CustomEvent('SpawnEnemy', { detail: { wave: this.currentWave } }));
    }
}

const wavespawner = new WaveSpawner();
export default wavespawner;