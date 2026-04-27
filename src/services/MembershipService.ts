import Purchases, { CustomerInfo } from 'react-native-purchases';
import { Platform } from 'react-native';
import StorageService from './StorageService';
import { STORAGE_KEYS, REVENUECAT_API_KEYS, MEMBERSHIP_ENTITLEMENT } from '../utils/constants';

export interface MembershipState {
  isActive: boolean;
  type: 'lifetime' | 'monthly' | 'yearly' | null;
  expiresAt: string | null;
  isTrial: boolean;
}

type MembershipType = 'lifetime' | 'monthly' | 'yearly';

function inferType(productIdentifier: string): MembershipType {
  if (productIdentifier.includes('lifetime')) return 'lifetime';
  if (productIdentifier.includes('yearly')) return 'yearly';
  return 'monthly';
}

class MembershipService {
  async initialize(): Promise<void> {
    const apiKey = Platform.OS === 'ios' ? REVENUECAT_API_KEYS.IOS : REVENUECAT_API_KEYS.ANDROID;
    Purchases.configure({ apiKey });
    try {
      const customerInfo = await Purchases.getCustomerInfo();
      await this._syncCache(customerInfo);
    } catch {
      // 忽略网络错误，fallback 到本地缓存
    }
  }

  async isActive(): Promise<boolean> {
    try {
      const customerInfo = await Purchases.getCustomerInfo();
      await this._syncCache(customerInfo);
      return !!customerInfo.entitlements.active[MEMBERSHIP_ENTITLEMENT];
    } catch {
      const state = await this._getCachedState();
      return this._isActiveFromCache(state);
    }
  }

  async getProductPrices(productIds: string[]): Promise<Record<string, string>> {
    const products = await Purchases.getProducts(productIds);
    const map: Record<string, string> = {};
    for (const p of products) {
      map[p.identifier] = p.priceString;
    }
    return map;
  }

  async purchase(productId: string): Promise<void> {
    const products = await Purchases.getProducts([productId]);
    if (products.length === 0) throw new Error(`Product not found: ${productId}`);
    const { customerInfo } = await Purchases.purchaseStoreProduct(products[0]);
    await this._syncCache(customerInfo);
  }

  async restore(): Promise<void> {
    const customerInfo = await Purchases.restorePurchases();
    await this._syncCache(customerInfo);
  }

  async getCustomerInfo(): Promise<CustomerInfo> {
    return Purchases.getCustomerInfo();
  }

  async syncWithServer(): Promise<void> {
    // 占位，未来后端验证用
  }

  private async _syncCache(customerInfo: CustomerInfo): Promise<void> {
    const entitlement = customerInfo.entitlements.active[MEMBERSHIP_ENTITLEMENT];
    const isActive = !!entitlement;
    const type: MembershipType | null = entitlement ? inferType(entitlement.productIdentifier) : null;
    const expiresAt = entitlement?.expirationDate ?? null;
    const isTrial = entitlement?.periodType === 'trial';
    await StorageService.storeData(STORAGE_KEYS.MEMBERSHIP, { isActive, type, expiresAt, isTrial });
  }

  private async _getCachedState(): Promise<MembershipState> {
    const state = await StorageService.getData(STORAGE_KEYS.MEMBERSHIP);
    if (!state) return { isActive: false, type: null, expiresAt: null, isTrial: false };
    const cached = state as MembershipState;
    return { ...cached, isTrial: cached.isTrial ?? false };
  }

  private _isActiveFromCache(state: MembershipState): boolean {
    if (!state.isActive || !state.type) return false;
    if (state.type === 'lifetime') return true;
    if (!state.expiresAt) return false;
    return new Date(state.expiresAt) > new Date();
  }
}

export default new MembershipService();
