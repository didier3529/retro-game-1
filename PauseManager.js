import gameloopmanager from './GameLoopManager.js';
import uimanager from './UIManager.js';
import inputmanager from './InputManager.js';
import analyticstracker from './AnalyticsTracker.js';

class PauseManager extends EventTarget {
  constructor() {
    super();
    this.paused = false;
    this.pauseButtonSelector = '.btn-pause';
    this.pauseScreenSelector = '.menu-screen[data-screen="PauseMenu"]';
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onPauseClick = this._onPauseClick.bind(this);
    this._onInputEvent = this._onInputEvent.bind(this);
  }

  init() {
    // PM-2: integrity checks
    const viewport = document.getElementById('canvas-viewport');
    if (!viewport) console.error('PauseManager: #canvas-viewport element not found');
    const hud = document.getElementById('hud-container');
    if (!hud) console.error('PauseManager: #hud-container element not found');
    const pauseScreen = document.querySelector(this.pauseScreenSelector);
    if (!pauseScreen) console.error('PauseManager: pause screen element not found');

    // PM-4: accessibility for pause screen
    if (pauseScreen) {
      pauseScreen.setAttribute('role', 'tabpanel');
      pauseScreen.setAttribute('aria-hidden', 'true');
    }

    // PM-3: pause button attributes and listener
    const pauseBtn = document.querySelector(this.pauseButtonSelector);
    if (pauseBtn) {
      pauseBtn.setAttribute('data-action', 'pause');
      pauseBtn.setAttribute('aria-label', 'Pause');
      pauseBtn.addEventListener('click', this._onPauseClick, { passive: true });
    }

    window.addEventListener('keydown', this._onKeyDown);
    if (inputmanager && typeof inputmanager.on === 'function') {
      inputmanager.on('InputEvent', this._onInputEvent);
    }

    // PM-1: sync with game loop events
    window.addEventListener('GamePause', () => this.pause(), { passive: true });
    window.addEventListener('GameResume', () => this.resume(), { passive: true });
  }

  _onPauseClick() {
    this.toggle();
  }

  _onKeyDown(e) {
    if (e.key === 'Escape') {
      this.toggle();
    }
  }

  _onInputEvent(e) {
    const detail = e.detail || {};
    if (detail.action === 'pause') {
      this.toggle();
    }
  }

  pause() {
    if (this.paused) return;
    this.paused = true;
    try {
      gameloopmanager.pause();
    } catch (err) {
      console.error('PauseManager: pause error', err);
    }
    uimanager.show('PauseMenu');
    analyticstracker.logEvent('GamePause');
    this.dispatchEvent(new CustomEvent('pause'));
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this._hidePauseMenu();
    try {
      gameloopmanager.resume();
    } catch (err) {
      console.error('PauseManager: resume error', err);
    }
    analyticstracker.logEvent('GameResume');
    this.dispatchEvent(new CustomEvent('resume'));
  }

  toggle() {
    this.paused ? this.resume() : this.pause();
  }

  isPaused() {
    return this.paused;
  }

  _hidePauseMenu() {
    const pauseScreen = document.querySelector(this.pauseScreenSelector);
    if (pauseScreen) {
      pauseScreen.classList.remove('is-active');
      pauseScreen.setAttribute('aria-hidden', 'true');
    }
  }
}

const pausemanager = new PauseManager();

document.addEventListener('DOMContentLoaded', () => pausemanager.init(), { once: true, passive: true });

export default pausemanager;