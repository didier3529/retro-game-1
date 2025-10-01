class InputManager {
  constructor() {
    this.keyMap = {
      moveForward: ['KeyW', 'ArrowUp'],
      rotateLeft: ['KeyA', 'ArrowLeft'],
      rotateRight: ['KeyD', 'ArrowRight'],
      shoot: ['Space', 'KeyX', 'KeyZ'],
      pause: ['Escape', 'KeyP']
    }
    this.keyState = new Set()
    this.actionState = {}
    this.subscribers = {}
    this.prevGamepad = {}
    this.gpLoopId = null
    this.touch = {}
    this._handleKeyDown = this._handleKeyDown.bind(this)
    this._handleKeyUp = this._handleKeyUp.bind(this)
    this._gpLoop = this._gpLoop.bind(this)
  }

  init() {
    this.reset()
    window.addEventListener('keydown', this._handleKeyDown, { passive: true })
    window.addEventListener('keyup', this._handleKeyUp, { passive: true })
    const canvas = document.getElementById('canvas-viewport')
    if (!canvas) {
      console.warn('InputManager: #canvas-viewport element not found')
    } else {
      if (canvas.getAttribute('aria-live') !== 'polite') {
        console.warn('InputManager: #canvas-viewport should have aria-live="polite"')
      }
      this._onPointerDown = this._handlePointerDown.bind(this)
      this._onPointerMove = this._handlePointerMove.bind(this)
      this._onPointerUp = this._handlePointerUp.bind(this)
      canvas.addEventListener('pointerdown', this._onPointerDown)
      canvas.addEventListener('pointermove', this._onPointerMove)
      canvas.addEventListener('pointerup', this._onPointerUp)
      canvas.addEventListener('pointercancel', this._onPointerUp)
    }
    this._startGamepadLoop()
    // I1: Emit 'InputReady' event at end of init()
    window.dispatchEvent(new CustomEvent('InputReady'))
  }

  on(event, cb) {
    if (!this.subscribers[event]) this.subscribers[event] = new Set()
    this.subscribers[event].add(cb)
    // I3: Warn if subscribers[event].size exceeds 10
    const size = this.subscribers[event].size
    if (size > 10) {
      console.warn(`InputManager: possible subscriber leak detected for event "${event}", ${size} listeners`)
    }
  }

  off(event, cb) {
    if (this.subscribers[event]) this.subscribers[event].delete(cb)
  }

  emit(event, payload) {
    const subs = this.subscribers[event]
    if (subs) subs.forEach(cb => {
      try { cb(payload) } catch (e) { console.error(e) }
    })
  }

  getState() {
    return {
      keys: Array.from(this.keyState),
      actions: { ...this.actionState }
    }
  }

  reset() {
    this.keyState.clear()
    this.actionState = {}
    this.prevGamepad = {}
    this.touch = {}
  }

  destroy() {
    window.removeEventListener('keydown', this._handleKeyDown)
    window.removeEventListener('keyup', this._handleKeyUp)
    const canvas = document.getElementById('canvas-viewport')
    if (canvas) {
      canvas.removeEventListener('pointerdown', this._onPointerDown)
      canvas.removeEventListener('pointermove', this._onPointerMove)
      canvas.removeEventListener('pointerup', this._onPointerUp)
      canvas.removeEventListener('pointercancel', this._onPointerUp)
    }
    if (this.gpLoopId) cancelAnimationFrame(this.gpLoopId)
    this.subscribers = {}
  }

  setMapping(newMap) {
    this.keyMap = Object.assign({}, this.keyMap, newMap)
  }

  _handleKeyDown(e) {
    if (e.repeat) return
    const code = e.code
    this.keyState.add(code)
    this._processKeyChange(code, true)
  }

  _handleKeyUp(e) {
    const code = e.code
    this.keyState.delete(code)
    this._processKeyChange(code, false)
  }

  _processKeyChange(code, isDown) {
    for (const action in this.keyMap) {
      if (this.keyMap[action].includes(code)) {
        this.actionState[action] = isDown
        this.emit('InputEvent', {
          type: 'action',
          action,
          value: isDown,
          timestamp: Date.now()
        })
      }
    }
  }

  _handlePointerDown(e) {
    this.touch.startX = e.clientX
    this.touch.startY = e.clientY
    this.touch.startTime = Date.now()
    this.touch.lastX = e.clientX
    this.touch.lastY = e.clientY
  }

  _handlePointerMove(e) {
    if (!this.touch.startX) return
    const dx = e.clientX - this.touch.startX
    const dy = e.clientY - this.touch.startY
    this.touch.lastX = e.clientX
    this.touch.lastY = e.clientY
    const thresh = 10
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > thresh) {
      if (dx > 0) this._pointerAction('rotateRight', true)
      else this._pointerAction('rotateLeft', true)
    } else if (Math.abs(dy) > thresh) {
      this._pointerAction('moveForward', dy < 0)
    }
  }

  _handlePointerUp(e) {
    const dt = Date.now() - (this.touch.startTime || 0)
    const dx = e.clientX - (this.touch.startX || e.clientX)
    const dy = e.clientY - (this.touch.startY || e.clientY)
    if (dt < 200 && Math.hypot(dx, dy) < 10) {
      this.emit('InputEvent', {
        type: 'action',
        action: 'shoot',
        value: true,
        timestamp: Date.now()
      })
    }
    ['moveForward', 'rotateLeft', 'rotateRight'].forEach(a => {
      if (this.actionState[a]) {
        this.actionState[a] = false
        this.emit('InputEvent', {
          type: 'action',
          action: a,
          value: false,
          timestamp: Date.now()
        })
      }
    })
    this.touch = {}
  }

  _pointerAction(action, isDown) {
    if (this.actionState[action] === isDown) return
    this.actionState[action] = isDown
    this.emit('InputEvent', {
      type: 'action',
      action,
      value: isDown,
      timestamp: Date.now()
    })
  }

  _startGamepadLoop() {
    this.gpLoopId = requestAnimationFrame(this._gpLoop)
  }

  _gpLoop() {
    const gps = navigator.getGamepads ? navigator.getGamepads() : []
    for (const gp of gps) {
      if (gp && gp.connected) this._processGamepad(gp)
    }
    this.gpLoopId = requestAnimationFrame(this._gpLoop)
  }

  _processGamepad(gp) {
    const thresh = 0.2
    const axisX = gp.axes[0] || 0
    const axisY = gp.axes[1] || 0
    const moveVal = -axisY
    this._gamepadAction('moveForward', moveVal > thresh)
    this._gamepadAction('rotateRight', axisX > thresh)
    this._gamepadAction('rotateLeft', axisX < -thresh)
    gp.buttons.forEach((btn, idx) => {
      if (idx === 0) this._gamepadAction('shoot', btn.pressed)
      if (idx === 9) this._gamepadAction('pause', btn.pressed)
    })
  }

  _gamepadAction(action, isDown) {
    const prev = this.prevGamepad[action] || false
    if (isDown !== prev) {
      this.prevGamepad[action] = isDown
      this.actionState[action] = isDown
      this.emit('InputEvent', {
        type: 'action',
        action,
        value: isDown,
        timestamp: Date.now()
      })
    }
  }
}

const inputManager = new InputManager()
export default inputManager