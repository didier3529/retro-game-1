import { eventBus as globalEventBus } from './EventBus.js';

class EventBus extends EventTarget {
  on(type, listener) {
    this.addEventListener(type, listener, { passive: true });
  }
  off(type, listener) {
    this.removeEventListener(type, listener);
  }
  emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}

const eventBus = new EventBus();

class Component {}

class Entity {
  constructor(id) {
    this.id = id;
    this.components = new Map();
  }
  addComponent(component) {
    const type = component.constructor;
    if (this.components.has(type)) {
      console.warn(`Entity ${this.id} already has component ${type.name}`);
    }
    this.components.set(type, component);
  }
  removeComponent(CompClass) {
    if (!this.components.has(CompClass)) {
      console.warn(`Entity ${this.id} missing component ${CompClass.name}`);
    }
    this.components.delete(CompClass);
  }
  getComponent(CompClass) {
    return this.components.get(CompClass);
  }
  hasComponent(CompClass) {
    return this.components.has(CompClass);
  }
}

class EntityManager {
  constructor() {
    this.nextId = 1;
    this.entities = new Map();
    this.componentIndex = new Map();
    this.entityPool = [];
  }
  createEntity() {
    let entity;
    if (this.entityPool.length) {
      entity = this.entityPool.pop();
      entity.components.clear();
      entity.id = this.nextId++;
    } else {
      entity = new Entity(this.nextId++);
    }
    this.entities.set(entity.id, entity);
    return entity;
  }
  destroyEntity(entity) {
    if (!this.entities.has(entity.id)) return;
    entity.components.forEach((comp, CompClass) => {
      const set = this.componentIndex.get(CompClass);
      set && set.delete(entity);
    });
    this.entities.delete(entity.id);
    this.entityPool.push(entity);
  }
  addComponent(entity, component) {
    const CompClass = component.constructor;
    if (entity.hasComponent(CompClass)) {
      console.warn(`Entity ${entity.id} already has component ${CompClass.name}`);
    }
    entity.addComponent(component);
    if (!this.componentIndex.has(CompClass)) {
      this.componentIndex.set(CompClass, new Set());
    }
    this.componentIndex.get(CompClass).add(entity);
  }
  removeComponent(entity, CompClass) {
    if (!entity.hasComponent(CompClass)) {
      console.warn(`Entity ${entity.id} does not have component ${CompClass.name}`);
    }
    entity.removeComponent(CompClass);
    const set = this.componentIndex.get(CompClass);
    set && set.delete(entity);
  }
  getEntitiesWithComponents(compClasses) {
    if (!compClasses.length) return [];
    const sets = compClasses.map(c => this.componentIndex.get(c) || new Set());
    const smallest = sets.reduce((a, b) => a.size < b.size ? a : b);
    const result = [];
    smallest.forEach(entity => {
      if (compClasses.every(c => entity.hasComponent(c))) {
        result.push(entity);
      }
    });
    return result;
  }
  clear() {
    this.entities.forEach(e => this.destroyEntity(e));
    this.componentIndex.clear();
  }
}

class System {
  constructor(componentClasses = []) {
    this.componentClasses = componentClasses;
  }
  init() {}
  update(dt, entities) {}
  teardown() {}
}

class SystemManager {
  constructor(entityManager) {
    this.entityManager = entityManager;
    this.systems = [];
  }
  registerSystem(system) {
    if (this.systems.includes(system)) return;
    system.init();
    this.systems.push(system);
  }
  unregisterSystem(system) {
    const idx = this.systems.indexOf(system);
    if (idx === -1) return;
    system.teardown();
    this.systems.splice(idx, 1);
  }
  update(dt) {
    this.systems.forEach(system => {
      const entities = this.entityManager.getEntitiesWithComponents(system.componentClasses);
      try {
        system.update(dt, entities);
      } catch (e) {
        console.error(`Error in system ${system.constructor.name}:`, e);
      }
    });
  }
  teardownAll() {
    this.systems.forEach(s => s.teardown());
    this.systems = [];
  }
}

const entityManager = new EntityManager();
const systemManager = new SystemManager(entityManager);

function init() {
  eventBus.on('Tick', e => systemManager.update(e.detail.dt));
  eventBus.on('GameOver', () => systemManager.teardownAll());
  eventBus.on('InputEvent', e => {
    // TODO: route e.detail to ECS
  });
  eventBus.on('Collision', e => {
    // TODO: handle collision in ECS
  });
  eventBus.emit('EntitySystemReady');
}

eventBus.on('GameStart', init);

export {
  eventBus,
  Component,
  Entity,
  entityManager,
  systemManager,
  System,
  init
}