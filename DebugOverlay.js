import physicsEngine from './PhysicsEngine.js';
import entitySystem from './EntitySystem.js';
import settingsmanager from './SettingsManager.js';
import storagemanager from './StorageManager.js';

class DebugOverlay {
  constructor(){
    this.debugActive = false;
    this.urlDebug = new URLSearchParams(window.location.search).get('debug') === '1';
    this.toggleKey = 'F3';
    this.overlay = null;
    this.ctx = null;
    this.rafId = null;
    this.lastFrameTime = 0;
    this.fps = 0;
    this.collisionCount = 0;
    this.collisionPerSec = 0;
    this.lastCollReset = performance.now();
    this.boundUpdate = this.update.bind(this);
    this.boundToggle = this.toggle.bind(this);
    this.collisionListener = () => { this.collisionCount++; };
    this.elements = { viewport: null, overlay: null };
  }

  init(){
    const viewport = document.getElementById('canvas-viewport');
    if (!viewport) throw new Error('Missing #canvas-viewport');
    this.elements.viewport = viewport;

    const overlay = document.createElement('canvas');
    overlay.id = 'debug-overlay';
    overlay.className = 'debug-overlay';
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '1000';
    overlay.style.display = 'none';
    // grid background for vector-math overlay
    overlay.style.backgroundImage =
      'repeating-linear-gradient(0deg, rgba(0,255,0,0.2) 0, rgba(0,255,0,0.2) 1px, transparent 1px, transparent 20px), ' +
      'repeating-linear-gradient(90deg, rgba(0,255,0,0.2) 0, rgba(0,255,0,0.2) 1px, transparent 1px, transparent 20px)';
    overlay.style.backgroundSize = '20px 20px';

    viewport.appendChild(overlay);
    this.elements.overlay = overlay;
    this.overlay = overlay;
    this.ctx = overlay.getContext('2d');

    this.resize();
    window.addEventListener('resize', () => this.resize(), { passive: true });
    window.addEventListener('keydown', this.boundToggle, { passive: true });
    if (physicsEngine.on) physicsEngine.on('Collision', this.collisionListener);
    if (this.urlDebug) this.enable();
  }

  resize(){
    if (!this.overlay) return;
    const viewport = this.overlay.parentElement;
    this.overlay.width = viewport.clientWidth;
    this.overlay.height = viewport.clientHeight;
  }

  toggle(e){
    if (e.key === this.toggleKey){
      if (this.debugActive){
        this.disable();
        settingsmanager.set('debugOverlay', false);
      } else {
        this.enable();
        settingsmanager.set('debugOverlay', true);
      }
      settingsmanager.save();
      storagemanager.commitAll();
    }
  }

  enable(){
    if (this.debugActive) return;
    this.debugActive = true;
    this.elements.overlay.style.display = 'block';
    this.elements.overlay.classList.add('debug-active');
    this.lastFrameTime = performance.now();
    this.lastCollReset = this.lastFrameTime;
    this.rafId = requestAnimationFrame(this.boundUpdate);
  }

  disable(){
    if (!this.debugActive) return;
    this.debugActive = false;
    this.elements.overlay.style.display = 'none';
    this.elements.overlay.classList.remove('debug-active');
    cancelAnimationFrame(this.rafId);
    this.clear();
  }

  clear(){
    if (this.ctx) this.ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
  }

  update(ts){
    const dt = ts - this.lastFrameTime;
    this.fps = 1000 / dt;
    this.lastFrameTime = ts;
    if (ts - this.lastCollReset >= 1000){
      this.collisionPerSec = this.collisionCount;
      this.collisionCount = 0;
      this.lastCollReset = ts;
    }
    this.draw();
    this.rafId = requestAnimationFrame(this.boundUpdate);
  }

  draw(){
    const ctx = this.ctx;
    const w = this.overlay.width;
    const h = this.overlay.height;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(0,255,0,0.7)';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.font = '12px monospace';
    const lines = [
      `FPS: ${this.fps.toFixed(1)}`,
      `Entities: ${this.getEntityCount()}`,
      `Coll/s: ${this.collisionPerSec}`
    ];
    if (performance.memory){
      lines.push(`Heap: ${(performance.memory.usedJSHeapSize/1024/1024).toFixed(2)}MB`);
    }
    const padding = 5;
    const lineHeight = 16;
    const panelWidth = 140;
    const panelHeight = lines.length * lineHeight + padding * 2;
    ctx.fillRect(padding, padding, panelWidth, panelHeight);
    ctx.fillStyle = '#0f0';
    lines.forEach((l, i) => ctx.fillText(l, padding * 2, padding + (i + 1) * lineHeight));

    const entities = this.getEntities();
    entities.forEach(e => {
      const p = e.position;
      const v = e.velocity;
      if (p && v){
        const x = p.x;
        const y = p.y;
        const vx = v.x;
        const vy = v.y;
        const scale = 0.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + vx * scale, y + vy * scale);
        ctx.stroke();
      }
    });
  }

  getEntities(){
    if (entitySystem.query) return entitySystem.query('movable');
    if (entitySystem.getAllEntities) return entitySystem.getAllEntities();
    if (Array.isArray(entitySystem.entities)) return entitySystem.entities;
    return [];
  }

  getEntityCount(){
    return this.getEntities().length;
  }
}

const debugOverlay = new DebugOverlay();
export default debugOverlay;