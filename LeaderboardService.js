// LeaderboardService.js
import logger from './logger';

const API_BASE = (typeof CONFIG !== 'undefined' && CONFIG.api && CONFIG.api.leaderboardUrl) || '/api/leaderboards';

/**
 * LeaderboardService provides methods to fetch and submit leaderboard scores,
 * retrieve player ranks, reset leaderboard, with in-memory caching and event emissions.
 */
class LeaderboardService {
  constructor() {
    this.cache = new Map();
    this.cacheTTL = 60 * 1000; // 1 minute
  }

  /**
   * Fetch leaderboard entries using filter.
   * @param {{limit: number, offset: number}} filter - Pagination settings.
   * @returns {Promise<Array>} Resolves to array of leaderboard entries.
   */
  async fetch({ limit, offset }) {
    return this.getLeaderboard(limit, offset);
  }

  _emit(eventName, detail) {
    document.dispatchEvent(new CustomEvent(eventName, { detail }));
  }

  _getCache(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  _setCache(key, data) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Submit a score for a user.
   * @param {string} userId - The ID of the user.
   * @param {number} score - The score to submit.
   * @returns {Promise<Object>} Resolves to submission result.
   */
  async submitScore(userId, score) {
    if (typeof userId !== 'string' || userId.trim() === '') {
      throw new Error('LeaderboardService.submitScore: invalid userId');
    }
    if (typeof score !== 'number' || !isFinite(score)) {
      throw new Error('LeaderboardService.submitScore: invalid score');
    }
    const payload = { userId: userId.trim(), score };
    try {
      const resp = await fetch(`${API_BASE}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!resp.ok) {
        const errText = await resp.text();
        logger.error('LeaderboardService.submitScore error:', errText);
        throw new Error(`Submit failed: ${resp.status}`);
      }
      const data = await resp.json();
      // invalidate caches
      this.cache.forEach((_, key) => {
        if (key.startsWith('leaders:') || key === `rank:${payload.userId}`) {
          this.cache.delete(key);
        }
      });
      this._emit('ScoreSubmitted', { userId: payload.userId, score, result: data });
      return data;
    } catch (err) {
      logger.error('LeaderboardService.submitScore exception:', err);
      throw err;
    }
  }

  /**
   * Retrieve leaderboard entries.
   * @param {number} [limit=10] - Number of entries to retrieve.
   * @param {number} [offset=0] - Starting offset.
   * @returns {Promise<Array>} Resolves to array of leaderboard entries.
   */
  async getLeaderboard(limit = 10, offset = 0) {
    limit = parseInt(limit, 10);
    offset = parseInt(offset, 10);
    if (isNaN(limit) || limit < 1) {
      throw new Error('LeaderboardService.getLeaderboard: invalid limit');
    }
    if (isNaN(offset) || offset < 0) {
      throw new Error('LeaderboardService.getLeaderboard: invalid offset');
    }
    const cacheKey = `leaders:${limit}:${offset}`;
    const cached = this._getCache(cacheKey);
    if (cached) {
      this._emit('LeaderboardReady', { leaderboard: cached, limit, offset, cached: true });
      return cached;
    }
    try {
      const resp = await fetch(`${API_BASE}?limit=${limit}&offset=${offset}`);
      if (!resp.ok) {
        const errText = await resp.text();
        logger.error('LeaderboardService.getLeaderboard error:', errText);
        throw new Error(`Fetch failed: ${resp.status}`);
      }
      const data = await resp.json();
      if (!Array.isArray(data)) {
        throw new Error('Invalid leaderboard format');
      }
      this._setCache(cacheKey, data);
      this._emit('LeaderboardReady', { leaderboard: data, limit, offset, cached: false });
      return data;
    } catch (err) {
      logger.error('LeaderboardService.getLeaderboard exception:', err);
      throw err;
    }
  }

  /**
   * Retrieve a player's rank.
   * @param {string} userId - The ID of the user.
   * @returns {Promise<number>} Resolves to the player's rank.
   */
  async getPlayerRank(userId) {
    if (typeof userId !== 'string' || userId.trim() === '') {
      throw new Error('LeaderboardService.getPlayerRank: invalid userId');
    }
    const uid = userId.trim();
    const cacheKey = `rank:${uid}`;
    const cached = this._getCache(cacheKey);
    if (cached) {
      this._emit('PlayerRankReady', { userId: uid, rank: cached, cached: true });
      return cached;
    }
    try {
      const resp = await fetch(`${API_BASE}/rank/${encodeURIComponent(uid)}`);
      if (!resp.ok) {
        const errText = await resp.text();
        logger.error('LeaderboardService.getPlayerRank error:', errText);
        throw new Error(`Fetch failed: ${resp.status}`);
      }
      const data = await resp.json();
      if (typeof data.rank !== 'number') {
        throw new Error('Invalid rank format');
      }
      this._setCache(cacheKey, data.rank);
      this._emit('PlayerRankReady', { userId: uid, rank: data.rank, cached: false });
      return data.rank;
    } catch (err) {
      logger.error('LeaderboardService.getPlayerRank exception:', err);
      throw err;
    }
  }

  /**
   * Reset the entire leaderboard.
   * @returns {Promise<Object>} Resolves to reset result.
   */
  async resetLeaderboard() {
    try {
      const resp = await fetch(`${API_BASE}/reset`, { method: 'POST' });
      if (!resp.ok) {
        const errText = await resp.text();
        logger.error('LeaderboardService.resetLeaderboard error:', errText);
        throw new Error(`Reset failed: ${resp.status}`);
      }
      const data = await resp.json();
      this.cache.clear();
      this._emit('LeaderboardReset', { result: data });
      return data;
    } catch (err) {
      logger.error('LeaderboardService.resetLeaderboard exception:', err);
      throw err;
    }
  }
}

const leaderboardService = new LeaderboardService();

export default leaderboardService;