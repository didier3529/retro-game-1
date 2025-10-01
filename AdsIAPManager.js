import analyticstracker from './AnalyticsTracker.js';
import storagemanager from './StorageManager.js';
import settingsmanager from './SettingsManager.js';
import uimanager from './UIManager.js';

class AdsIAPManager {
  constructor() {
    this.adLoaded = false;
    this.products = [];
    this.purchaseInProgress = false;
  }

  init() {
    this.initAdSDK();
    this.initIAPSDK();
  }

  initAdSDK() {
    if (!window.AdService) {
      console.warn('AdService not available');
      return;
    }
    AdService.initialize({ appId: settingsmanager.get('adAppId') });
    AdService.on('adLoaded', () => {
      this.adLoaded = true;
      analyticstracker.logEvent('AdLoaded');
    });
    AdService.on('adFailedToLoad', (error) => {
      this.adLoaded = false;
      analyticstracker.logEvent('AdLoadFail', { error: error.message || error });
    });
    AdService.on('adRewarded', () => {
      analyticstracker.logEvent('AdRewarded');
      window.dispatchEvent(new CustomEvent('AdRewarded', { detail: {} }));
      uimanager.show('Store');
      this.loadRewardedAd();
    });
    this.loadRewardedAd();
  }

  loadRewardedAd() {
    if (!window.AdService) return;
    AdService.loadRewardedAd()
      .then(() => analyticstracker.logEvent('AdLoad'))
      .catch((err) => {
        analyticstracker.logEvent('AdLoadFail', { error: err.message || err });
        setTimeout(() => this.loadRewardedAd(), 30000);
      });
  }

  showRewardedAd() {
    if (window.AdService && this.adLoaded) {
      analyticstracker.logEvent('AdShow');
      AdService.showRewardedAd().catch((err) => {
        analyticstracker.logEvent('AdShowFail', { error: err.message || err });
      });
    } else {
      console.warn('Rewarded ad not ready');
    }
  }

  initIAPSDK() {
    if (!window.IAPService) {
      console.warn('IAPService not available');
      return;
    }
    const productIds = settingsmanager.get('iapProductIds') || [];
    IAPService.initialize({ products: productIds });
    IAPService.on('purchaseSuccess', (purchase) => this.onPurchaseSuccess(purchase));
    IAPService.on('purchaseFail', (error) => this.onPurchaseFail(error));
    this.loadProducts();
  }

  loadProducts() {
    if (!window.IAPService) return;
    IAPService.getProducts()
      .then((products) => {
        this.products = products;
        analyticstracker.logEvent('IAPProductsLoaded', { count: products.length });
      })
      .catch((err) => {
        analyticstracker.logEvent('IAPLoadFail', { error: err.message || err });
      });
  }

  purchase(itemId) {
    if (!window.IAPService) return;
    this.purchaseInProgress = true;
    analyticstracker.logEvent('PurchaseInitiated', { itemId });
    IAPService.purchase(itemId).catch(() => {
      // handled by purchaseFail event
    });
  }

  onPurchaseSuccess(purchase) {
    this.purchaseInProgress = false;
    analyticstracker.logEvent('PurchaseSuccess', { productId: purchase.productId });
    this.validatePurchase(purchase.receipt)
      .then((valid) => {
        if (valid) {
          this.acknowledgePurchase(purchase.token);
          storagemanager.commitAll();
          window.dispatchEvent(new CustomEvent('PurchaseSuccess', { detail: purchase }));
          uimanager.show('Store');
        } else {
          throw new Error('Receipt validation failed');
        }
      })
      .catch((err) => this.onPurchaseFail(err));
  }

  onPurchaseFail(error) {
    this.purchaseInProgress = false;
    analyticstracker.logEvent('PurchaseFail', { error: error.message || error });
    window.dispatchEvent(new CustomEvent('PurchaseFail', { detail: error }));
    uimanager.show('Store');
  }

  validatePurchase(receipt) {
    return fetch('/validateReceipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receipt })
    })
      .then((res) => res.json())
      .then((data) => data.valid)
      .catch((err) => {
        analyticstracker.logEvent('ReceiptValidationFail', { error: err.message || err });
        return false;
      });
  }

  acknowledgePurchase(token) {
    if (!window.IAPService) return;
    IAPService.finishTransaction(token).catch((err) => {
      analyticstracker.logEvent('AcknowledgeFail', { error: err.message || err });
    });
  }
}

const adsiapmanager = new AdsIAPManager();

export default adsiapmanager;