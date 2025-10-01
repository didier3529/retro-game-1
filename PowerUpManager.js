import GameLoopManager from './GameLoopManager.js';
import storagemanager from './StorageManager.js';

const POWERUP_TYPES = {
  shield: { duration: 10000, strength: 1, cooldown: 0 },
  rapidFire: { duration: 5000, strength: 2, cooldown: 0 },
  extraLife: { duration: 0, strength: 1, cooldown: 0 }
};

class PowerUpManager {
  constructor() {
    this.types = POWERUP_TYPES;
    this.spawnQueue = [];
    this.active = new Map();
    this.nextId = 1;
  }

  init() {
    GameLoopManager.on('Frame', e => {
      const dt = e.detail && e.detail.deltaTime != null ? e.detail.deltaTime : e;
      this.update(dt);
    });
    GameLoopManager.on('GameStart', () => this.clearAll());
    GameLoopManager.on('Collision', e => this.handleCollision(e));
    if (storagemanager.on) {
      storagemanager.on('StorageReady', () => this.restoreState());
    }
  }

  handleCollision(detail) {
    if (detail && detail.puId != null) {
      this.activate(detail.puId);
    }
  }

  spawn(type, position) {
    const config = this.types[type];
    if (!config) {
      console.warn(`PowerUpManager: unknown type "${type}"`);
      return null;
    }
    const id = this.nextId++;
    const pu = {
      id,
      type,
      position: { x: position.x, y: position.y },
      duration: config.duration,
      strength: config.strength,
      remaining: config.duration,
      cooldown: config.cooldown,
      active: false
    };
    this.spawnQueue.push(pu);
    GameLoopManager.emit('PowerUpSpawned', { id, type, position: pu.position });
    storagemanager.commitAll();
    return id;
  }

  activate(id) {
    let pu = this.spawnQueue.find(p => p.id === id);
    if (!pu) pu = this.active.get(id);
    if (!pu || pu.active) return;
    pu.active = true;
    pu.remaining = pu.duration;
    this.active.set(id, pu);
    GameLoopManager.emit('PowerUpApplied', {
      id,
      type: pu.type,
      strength: pu.strength,
      duration: pu.duration
    });
    GameLoopManager.emit('PlaySFX', { sound: `powerup-${pu.type}` });
    if (pu.type === 'extraLife') {
      GameLoopManager.emit('LivesChanged', { delta: pu.strength });
      this.deactivate(id);
    }
    storagemanager.commitAll();
  }

  deactivate(id) {
    const pu = this.active.get(id);
    if (!pu) return;
    this.active.delete(id);
    GameLoopManager.emit('PowerUpExpired', { id, type: pu.type });
    storagemanager.commitAll();
  }

  update(deltaTime) {
    if (!deltaTime || !this.active.size) return;
    this.active.forEach((pu, id) => {
      if (pu.duration > 0) {
        pu.remaining -= deltaTime;
        if (pu.remaining <= 0) this.deactivate(id);
      }
    });
  }

  clearAll() {
    this.spawnQueue = [];
    this.active.clear();
  }

  restoreState() {
    const state = storagemanager.get('powerUps');
    if (!state) return;
    this.spawnQueue = Array.isArray(state.spawnQueue) ? state.spawnQueue : [];
    this.active = new Map(Array.isArray(state.active) ? state.active : []);
    if (typeof state.nextId === 'number') this.nextId = state.nextId;
  }
}

const powerUpManager = new PowerUpManager();
export default powerUpManager;