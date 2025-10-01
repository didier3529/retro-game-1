import GameLoopManager from './GameLoopManager.js';
import { logEvent } from './AnalyticsTracker.js';

document.addEventListener('DOMContentLoaded', () => {
  const menu = document.querySelector('.menu-screen[data-screen="main"]');
  if (!menu) {
    console.error('MainMenuUI: main menu screen not found');
    return;
  }
  // issue1: set role
  menu.setAttribute('role', 'tabpanel');
  // issue2: set initial aria-hidden and subscribe to toggle on Navigate
  menu.setAttribute('aria-hidden', 'false');
  window.addEventListener('Navigate', e => {
    const screenId = e.detail && e.detail.screenId;
    menu.setAttribute('aria-hidden', screenId !== 'main');
  }, { passive: true });
  // issue4: check grid-container wrapper
  if (!menu.closest('.grid-container')) {
    console.warn('MainMenuUI: missing .grid-container');
  }
  const labelMap = {
    start: 'Start Game',
    settings: 'Settings',
    leaderboard: 'Leaderboards',
    store: 'Store'
  };
  const buttons = Array.from(menu.querySelectorAll('.btn-start, .btn-settings, .btn-leaderboard, .btn-store'));
  buttons.forEach(button => {
    const action = button.getAttribute('data-action');
    if (!action) return;
    // issue3: set aria-label on each button
    button.setAttribute('aria-label', labelMap[action] || action);
    button.addEventListener('click', onButtonClick);
    button.addEventListener('keydown', onButtonKeydown);
  });
  const firstBtn = buttons.find(b => b.classList.contains('btn-start')) || buttons[0];
  if (firstBtn) firstBtn.focus();
}, { once: true, passive: true });

function onButtonClick(e) {
  const action = e.currentTarget.getAttribute('data-action');
  handleAction(action);
}

function onButtonKeydown(e) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    const action = e.currentTarget.getAttribute('data-action');
    handleAction(action);
  }
}

function handleAction(action) {
  if (!action) return;
  switch (action) {
    case 'start':
      logEvent('GameStart');
      GameLoopManager.start();
      break;
    case 'settings':
    case 'leaderboard':
    case 'store':
      logEvent('Navigate', { to: action });
      window.dispatchEvent(new CustomEvent('Navigate', { detail: { screenId: action } }));
      break;
    default:
      console.warn(`MainMenuUI: unknown action "${action}"`);
  }
}