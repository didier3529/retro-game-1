import { on as onStorageEvent } from './StorageManager.js'
import GameLoopManager from './GameLoopManager.js'
import AdsIAPManager from './AdsIAPManager.js'
import LeaderboardService from './LeaderboardService.js'

const ANALYTICS_ENDPOINT = '/api/analytics'
const BATCH_SIZE = 20
const BATCH_INTERVAL = 5000

let eventQueue = []
let flushTimer = null
let userId = null
let optedOut = false

function getTotalListeners() {
    if (typeof window.listenerCount === 'function') {
        try {
            return window.listenerCount()
        } catch {
            return 0
        }
    }
    return 0
}

function setOptOut(flag) {
    optedOut = !!flag
}

function enqueueEvent(name, data = {}) {
    if (optedOut) return
    const timestamp = new Date().toISOString()
    eventQueue.push({ name, data, userId, timestamp })
    if (eventQueue.length > 0 && getTotalListeners() > 10) {
        console.warn('Potential listener leak detected: more than 10 listeners registered.')
    }
    if (eventQueue.length >= BATCH_SIZE) {
        flushQueue()
    } else if (!flushTimer) {
        flushTimer = setTimeout(flushQueue, BATCH_INTERVAL)
    }
}

async function flushQueue() {
    clearTimeout(flushTimer)
    flushTimer = null
    if (!eventQueue.length) return
    const payload = JSON.stringify({ events: eventQueue })
    eventQueue = []
    try {
        if (navigator.sendBeacon) {
            navigator.sendBeacon(ANALYTICS_ENDPOINT, payload)
        } else {
            await fetch(ANALYTICS_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payload
            })
        }
    } catch (e) {
        console.error('Analytics flush failed', e)
        window.dispatchEvent(new CustomEvent('AnalyticsError', { detail: e }))
    }
}

function startSession() {
    enqueueEvent('SessionStart')
}

function endSession() {
    enqueueEvent('SessionEnd')
    flushQueue()
}

function logEvent(name, data) {
    enqueueEvent(name, data)
}

function trackPageView(page) {
    enqueueEvent('PageView', { page })
}

function identifyUser(id) {
    userId = id
    enqueueEvent('Identify', { userId: id })
}

function teardown() {
    clearTimeout(flushTimer)
    eventQueue = []
}

function init() {
    onStorageEvent('StorageReady', startSession)
    GameLoopManager.on('GameStart', () => logEvent('GameStart'))
    GameLoopManager.on('GameOver', () => logEvent('GameOver'))
    GameLoopManager.on('GamePause', () => logEvent('GamePause'))
    GameLoopManager.on('GameResume', () => logEvent('GameResume'))
    AdsIAPManager.on('AdRewarded', () => logEvent('AdRewarded'))
    AdsIAPManager.on('PurchaseSuccess', e => logEvent('PurchaseSuccess', { itemId: e.detail.itemId }))
    AdsIAPManager.on('PurchaseFail', e => logEvent('PurchaseFail', { error: e.detail.error }))
    LeaderboardService.on('ScoreSubmitted', e => logEvent('ScoreSubmitted', { score: e.detail.score }))
    window.addEventListener('beforeunload', endSession, { passive: true })
    window.dispatchEvent(new CustomEvent('AnalyticsReady'))
}

document.addEventListener('DOMContentLoaded', init, { once: true, passive: true })

export {
    startSession,
    endSession,
    logEvent,
    trackPageView,
    identifyUser,
    teardown,
    setOptOut
}