import GameLoopManager from './GameLoopManager.js';
import uimanager from './UIManager.js';
import leaderboardservice from './LeaderboardService.js';
import storagemanager from './StorageManager.js';
import { logEvent, endSession } from './AnalyticsTracker.js';

class LifeScoreManager {
  constructor() {
    this.defaultLives = 3;
    this.lives = this.defaultLives;
    this.score = 0;
    this.highScore = parseInt(localStorage.getItem('highScore')) || 0;
    this.livesElem = null;
    this.scoreElem = null;
    this.reset = this.reset.bind(this);
    this.handleGainScore = this.handleGainScore.bind(this);
    this.handleLoseLife = this.handleLoseLife.bind(this);
  }

  init() {
    this.livesElem = document.getElementById('hud-lives');
    this.scoreElem = document.getElementById('hud-score');
    if (this.livesElem && this.livesElem.getAttribute('aria-live') !== 'assertive') {
      console.warn('LifeScoreManager: #hud-lives aria-live should be "assertive".');
    }
    if (this.scoreElem && this.scoreElem.getAttribute('aria-live') !== 'polite') {
      console.warn('LifeScoreManager: #hud-score aria-live should be "polite".');
    }
    this.updateLivesUI();
    this.updateScoreUI();
    window.dispatchEvent(new CustomEvent('LifeScoreReady'));
    GameLoopManager.on('GameStart', this.reset);
    window.addEventListener('GainScore', this.handleGainScore, { passive: true });
    window.addEventListener('LoseLife', this.handleLoseLife, { passive: true });
  }

  reset() {
    this.lives = this.defaultLives;
    this.score = 0;
    this.updateLivesUI();
    this.updateScoreUI();
    window.dispatchEvent(new CustomEvent('LivesChanged', { detail: { lives: this.lives } }));
    window.dispatchEvent(new CustomEvent('ScoreChanged', { detail: { score: this.score } }));
  }

  handleGainScore(e) {
    const amount = e.detail && Number(e.detail.amount) || 0;
    if (amount > 0) this.updateScore(amount);
  }

  handleLoseLife(e) {
    const amount = e.detail && Number(e.detail.amount) || 1;
    this.loseLife(amount);
  }

  updateScore(amount) {
    this.score += amount;
    this.updateScoreUI();
    window.dispatchEvent(new CustomEvent('ScoreChanged', { detail: { score: this.score, delta: amount } }));
    logEvent('ScoreUpdated', { score: this.score, delta: amount });
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('highScore', String(this.highScore));
      window.dispatchEvent(new CustomEvent('HighScoreChanged', { detail: { highScore: this.highScore } }));
    }
  }

  loseLife(amount) {
    this.lives = Math.max(0, this.lives - amount);
    this.updateLivesUI();
    window.dispatchEvent(new CustomEvent('LivesChanged', { detail: { lives: this.lives, delta: amount } }));
    logEvent('LifeLost', { livesRemaining: this.lives, delta: amount });
    if (this.lives <= 0) this.handleGameOver();
  }

  handleGameOver() {
    logEvent('GameOver', { finalScore: this.score });
    GameLoopManager.stop();
    uimanager.show('GameOver');
    leaderboardservice.submitScore(this.score);
    storagemanager.commitAll();
    endSession();
  }

  updateLivesUI() {
    if (this.livesElem) this.livesElem.textContent = String(this.lives);
  }

  updateScoreUI() {
    if (this.scoreElem) this.scoreElem.textContent = String(this.score);
  }

  getLives() {
    return this.lives;
  }

  getScore() {
    return this.score;
  }

  getHighScore() {
    return this.highScore;
  }
}

const lifescoremanager = new LifeScoreManager();
export default lifescoremanager;

GameLoopManager.on('GameStart', () => lifescoremanager.init());