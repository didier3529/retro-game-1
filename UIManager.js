import './EventBus.js'

class UIManager {
  constructor() {
    this.allowedScreens = new Set()
    this.currentScreen = null
    this.canvasViewport = null
    this.hudContainer = null
    this.hudLivesEl = null
    this.hudScoreEl = null
    this.loadingOverlay = null
    this._assetsReady = false
    this._storageReady = false
  }

  init() {
    this.canvasViewport = document.getElementById('canvas-viewport')
    if (this.canvasViewport) {
      this.canvasViewport.setAttribute('aria-live','polite')
    }
    this.hudContainer = document.getElementById('hud-container')
    this.hudLivesEl = document.getElementById('hud-lives')
    this.hudScoreEl = document.getElementById('hud-score')
    this.loadingOverlay = document.getElementById('loading-overlay')
    if (this.loadingOverlay) {
      this.loadingOverlay.setAttribute('aria-hidden','false')
    }
    if (!this.canvasViewport || !this.hudContainer) {
      console.error('UIManager init: Missing #canvas-viewport or #hud-container')
    }
    const screens = document.querySelectorAll('.menu-screen[data-screen]')
    screens.forEach(screen => {
      const id = screen.dataset.screen
      this.allowedScreens.add(id)
      screen.setAttribute('role','tabpanel')
      screen.setAttribute('aria-hidden','true')
      if (!screen.classList.contains('grid-container')) {
        screen.classList.add('grid-container')
      }
    })
    document.addEventListener('Navigate', e => {
      const id = e.detail && e.detail.screenId
      if (typeof id === 'string') this.show(id)
    }, {passive:true})
    document.addEventListener('GamePause', () => {
      if (this.canvasViewport) this.canvasViewport.classList.add('is-paused')
      if (this.hudContainer) this.hudContainer.classList.add('is-paused')
    }, {passive:true})
    document.addEventListener('GameResume', () => {
      if (this.canvasViewport) this.canvasViewport.classList.remove('is-paused')
      if (this.hudContainer) this.hudContainer.classList.remove('is-paused')
    }, {passive:true})
    document.addEventListener('AssetsReady', () => {
      this._assetsReady = true
      this._checkReady()
    }, {passive:true})
    document.addEventListener('StorageReady', () => {
      this._storageReady = true
      this._checkReady()
    }, {passive:true})
    document.addEventListener('GameStart', () => this.initHUD(), {passive:true})
  }

  _checkReady() {
    if (this._assetsReady && this._storageReady) {
      if (this.loadingOverlay) {
        this.loadingOverlay.classList.remove('is-loading')
        this.loadingOverlay.setAttribute('aria-hidden','true')
      }
      this.show('main')
    }
  }

  show(screenId) {
    if (!this.allowedScreens.has(screenId)) {
      console.warn(`UIManager: Unknown screen "${screenId}"`)
      return
    }
    const screens = document.querySelectorAll('.menu-screen[data-screen]')
    screens.forEach(screen => {
      const id = screen.dataset.screen
      const active = id === screenId
      screen.classList.toggle('is-active', active)
      screen.setAttribute('aria-hidden', (!active).toString())
      if (active) screen.focus({preventScroll:true})
    })
    this.currentScreen = screenId
  }

  initHUD() {
    if (!this.hudContainer) return
    this.hudContainer.setAttribute('role','region')
    this.hudContainer.setAttribute('aria-label','Game HUD')
    this.hudContainer.setAttribute('aria-hidden','false')
    if (this.hudLivesEl) {
      this.hudLivesEl.setAttribute('aria-live','assertive')
      this.hudLivesEl.textContent = '0'
    }
    if (this.hudScoreEl) {
      this.hudScoreEl.setAttribute('aria-live','polite')
      this.hudScoreEl.textContent = '0'
    }
    document.addEventListener('LivesChanged', e => {
      const v = e.detail && e.detail.lives
      if (this.hudLivesEl && typeof v !== 'undefined') {
        this.hudLivesEl.textContent = v
      }
    }, {passive:true})
    document.addEventListener('ScoreChanged', e => {
      const v = e.detail && e.detail.score
      if (this.hudScoreEl && typeof v !== 'undefined') {
        this.hudScoreEl.textContent = v
      }
    }, {passive:true})
  }
}

const uimanager = new UIManager()
document.addEventListener('DOMContentLoaded', () => uimanager.init(), {once:true,passive:true})
export default uimanager