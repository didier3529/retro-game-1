import GameLoopManager from './GameLoopManager.js';

class Vec2 {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  add(v) { this.x += v.x; this.y += v.y; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; return this; }
  scale(s) { this.x *= s; this.y *= s; return this; }
  dot(v) { return this.x * v.x + this.y * v.y; }
  length() { return Math.hypot(this.x, this.y); }
  normalize() { const len = this.length(); if (len > 0) this.scale(1 / len); return this; }
  clone() { return new Vec2(this.x, this.y); }
  static sub(a, b) { return new Vec2(a.x - b.x, a.y - b.y); }
  static add(a, b) { return new Vec2(a.x + b.x, a.y + b.y); }
  static scale(v, s) { return new Vec2(v.x * s, v.y * s); }
}

class Body {
  constructor(options = {}) {
    this.id = options.id || Symbol();
    this.position = options.position instanceof Vec2 ? options.position.clone() : new Vec2(options.position?.x, options.position?.y);
    this.velocity = options.velocity instanceof Vec2 ? options.velocity.clone() : new Vec2();
    this.acceleration = new Vec2();
    this.angle = options.angle || 0;
    this.angularVelocity = options.angularVelocity || 0;
    this.mass = options.mass > 0 ? options.mass : 1;
    this.invMass = 1 / this.mass;
    this.restitution = options.restitution != null ? options.restitution : 0.9;
    this.friction = options.friction != null ? options.friction : 0.1;
    this.shape = options.shape || { type: 'circle', radius: options.radius || 1 };
    this.static = options.static || false;
  }
  applyForce(force) {
    if (!this.static) this.acceleration.add(Vec2.scale(force, this.invMass));
  }
  integrate(dt) {
    if (this.static) return;
    this.velocity.add(Vec2.scale(this.acceleration, dt));
    this.position.add(Vec2.scale(this.velocity, dt));
    this.acceleration.x = 0; this.acceleration.y = 0;
  }
}

class World {
  constructor(emitter) {
    this.bodies = [];
    this._emitter = emitter;
  }
  addBody(body) {
    this.bodies.push(body);
  }
  removeBody(body) {
    const i = this.bodies.indexOf(body);
    if (i >= 0) this.bodies.splice(i, 1);
  }
  step(dt) {
    const len = this.bodies.length;
    for (let i = 0; i < len; i++) this.bodies[i].integrate(dt);
    for (let i = 0; i < len; i++) {
      const A = this.bodies[i];
      for (let j = i + 1; j < len; j++) {
        const B = this.bodies[j];
        this._collide(A, B);
      }
    }
  }
  _collide(A, B) {
    if (A.static && B.static) return;
    if (A.shape.type === 'circle' && B.shape.type === 'circle') {
      const diff = Vec2.sub(B.position, A.position);
      const dist = diff.length();
      const r = A.shape.radius + B.shape.radius;
      if (dist === 0 || dist < r) {
        const normal = dist === 0 ? new Vec2(1, 0) : diff.scale(1 / dist);
        const penetration = r - dist;
        this._resolveCollision(A, B, normal, penetration);
        const event = new CustomEvent('Collision', { detail: { bodyA: A, bodyB: B, normal, penetration } });
        this._emitter.dispatchEvent(event);
      }
    }
  }
  _resolveCollision(A, B, normal, penetration) {
    const invMassSum = (A.static ? 0 : A.invMass) + (B.static ? 0 : B.invMass);
    if (invMassSum === 0) return;
    const percent = 0.2;
    const correction = Vec2.scale(normal, percent * (penetration / invMassSum));
    if (!A.static) A.position.sub(Vec2.scale(correction, A.invMass));
    if (!B.static) B.position.add(Vec2.scale(correction, B.invMass));
    const relVel = Vec2.sub(B.velocity, A.velocity);
    const velAlongNormal = relVel.dot(normal);
    if (velAlongNormal > 0) return;
    const e = Math.min(A.restitution, B.restitution);
    const j = -(1 + e) * velAlongNormal / invMassSum;
    const impulse = Vec2.scale(normal, j);
    if (!A.static) A.velocity.sub(Vec2.scale(impulse, A.invMass));
    if (!B.static) B.velocity.add(Vec2.scale(impulse, B.invMass));
  }
}

class PhysicsEngine extends EventTarget {
  constructor() {
    super();
    this.world = null;
    this.running = false;
    this._onTick = this._onTick.bind(this);
    this._onStart = this._onStart.bind(this);
    this._onPause = this._onPause.bind(this);
    this._onResume = this._onResume.bind(this);
  }
  init(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) throw new Error(`PhysicsEngine: container ${containerSelector} not found`);
    container.setAttribute('aria-live', 'polite');
    this.container = container;
    this.world = new World(this);
    GameLoopManager.on('GameStart', this._onStart);
    GameLoopManager.on('GamePause', this._onPause);
    GameLoopManager.on('GameResume', this._onResume);
    GameLoopManager.on('GameOver', this._onPause);
    GameLoopManager.on('tick', this._onTick);
    this.dispatchEvent(new CustomEvent('PhysicsEngineReady'));
  }
  _onStart() {
    this.running = true;
  }
  _onPause() {
    this.running = false;
  }
  _onResume() {
    this.running = true;
  }
  _onTick(e) {
    if (!this.running) return;
    const dt = e.detail && e.detail.delta != null ? e.detail.delta : 1 / 60;
    this.world.step(dt);
  }
  addBody(options) {
    const body = new Body(options);
    this.world.addBody(body);
    return body;
  }
  removeBody(body) {
    this.world.removeBody(body);
  }
  clear() {
    if (this.world) this.world.bodies = [];
  }
  getBodies() {
    return this.world ? this.world.bodies : [];
  }
}

const physicsengine = new PhysicsEngine();

export default physicsengine;