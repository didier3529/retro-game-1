import assetmanager from './AssetManager.js';
import settingsmanager from './SettingsManager.js';
import storagemanager from './StorageManager.js';
import * as analyticstracker from './AnalyticsTracker.js';
import adsiapmanager from './AdsIAPManager.js';
import leaderboardservice from './LeaderboardService.js';
import inputmanager from './InputManager.js';
import physicsengine from './PhysicsEngine.js';
import entitysystem from './EntitySystem.js';
import wavespawner from './WaveSpawner.js';
import powerupmanager from './PowerUpManager.js';
import lifescoremanager from './LifeScoreManager.js';
import debugoverlay from './DebugOverlay.js';
import audiomanager from './AudioManager.js';
import uimanager from './UIManager.js';
import pausemanager from './PauseManager.js';
import gameloopmanager from './GameLoopManager.js';

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('canvas-viewport');
  const hud = document.getElementById('hud-container');
  const menuScreens = document.querySelectorAll('.menu-screen[data-screen]');

  // ARIA fixes
  if (canvas) {
    canvas.setAttribute('aria-live', 'polite');
  }
  if (hud) {
    hud.setAttribute('role', 'region');
    hud.setAttribute('aria-label', 'Game HUD');
  }
  menuScreens.forEach(menu => {
    menu.setAttribute('role', 'tabpanel');
    menu.setAttribute('aria-hidden', String(!menu.classList.contains('is-active')));
  });

  if (!canvas || !hud || menuScreens.length === 0) {
    console.error('Main initialization failed: Missing essential DOM elements.');
    return;
  }

  // Listen for StorageReady before starting session/UI
  window.addEventListener('StorageReady', () => {
    analyticstracker.startSession();
    uimanager.show('main');
  }, { once: true });

  // Loading overlay state
  const loader = document.getElementById('loading-overlay');
  if (loader) {
    loader.classList.add('is-loading');
    loader.setAttribute('aria-hidden', 'false');
  }

  assetmanager.loadAll()
    .then(() => {
      if (loader) {
        loader.classList.remove('is-loading');
        loader.setAttribute('aria-hidden', 'true');
      }
      window.dispatchEvent(new CustomEvent('AssetsReady'));
      return settingsmanager.load();
    })
    .then(() => 
      storagemanager.sync().then(() => {
        window.dispatchEvent(new CustomEvent('StorageReady'));
      })
    )
    .catch((err) => {
      console.error('Initialization error:', err);
    });

  function startGame() {
    inputmanager.init();
    physicsengine.init('#canvas-viewport');
    entitysystem.init();
    wavespawner.init();
    powerupmanager.init();
    lifescoremanager.init();
    debugoverlay.init();
    audiomanager.init();
    uimanager.initHUD();
    pausemanager.init();
    gameloopmanager.start();
    analyticstracker.logEvent('GameStart');
  }

  window.addEventListener('Navigate', (e) => {
    const screen = e.detail && e.detail.screen;
    if (screen === 'start') {
      startGame();
    }
  }, { passive: true });

  gameloopmanager.on('GameOver', () => {
    uimanager.show('GameOver');
    const score = typeof lifescoremanager.getScore === 'function' ? lifescoremanager.getScore() : 0;
    leaderboardservice.submitScore(score);
    analyticstracker.logEvent('GameOver');
  });

  gameloopmanager.on('GamePause', () => {
    analyticstracker.logEvent('GamePause');
  });

  gameloopmanager.on('GameResume', () => {
    analyticstracker.logEvent('GameResume');
  });

  window.addEventListener('beforeunload', () => {
    analyticstracker.endSession();
    storagemanager.commitAll();
  }, { passive: true });
}, { once: true });