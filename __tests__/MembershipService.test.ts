import MembershipService from '../src/services/MembershipService';
import StorageService from '../src/services/StorageService';
import Purchases from 'react-native-purchases';
import { STORAGE_KEYS, MEMBERSHIP_ENTITLEMENT, REVENUECAT_API_KEYS } from '../src/utils/constants';

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

jest.mock('react-native-google-mobile-ads', () => ({
  TestIds: {
    BANNER: 'test-banner-id',
    REWARDED: 'test-rewarded-id',
  },
  BannerAd: 'BannerAd',
  BannerAdSize: { BANNER: 'BANNER' },
}));

jest.mock('../src/services/StorageService', () => ({
  __esModule: true,
  default: {
    getData: jest.fn(),
    storeData: jest.fn(),
  },
}));

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    getCustomerInfo: jest.fn(),
    getProducts: jest.fn(),
    getOfferings: jest.fn(),
    purchaseStoreProduct: jest.fn(),
    restorePurchases: jest.fn(),
    addCustomerInfoUpdateListener: jest.fn(),
  },
}));

function makeCustomerInfo(
  entitlementActive: boolean,
  productId = 'membership_monthly',
  expirationDate: string | null = new Date(Date.now() + 86400000).toISOString(),
  periodType: string = 'NORMAL'
) {
  const active: Record<string, any> = {};
  if (entitlementActive) {
    active[MEMBERSHIP_ENTITLEMENT] = { productIdentifier: productId, expirationDate, periodType };
  }
  return { entitlements: { active } };
}

describe('MembershipService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('initialize', () => {
    it('calls Purchases.configure with ios api key', async () => {
      (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue(makeCustomerInfo(false));
      (StorageService.storeData as jest.Mock).mockResolvedValue(undefined);
      await MembershipService.initialize();
      expect(Purchases.configure).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'test_ujLWLhuhfjBhbmUelAGOqGBNhwV' })
      );
    });

    it('does not throw when getCustomerInfo fails on initialize', async () => {
      (Purchases.getCustomerInfo as jest.Mock).mockRejectedValue(new Error('network'));
      await expect(MembershipService.initialize()).resolves.toBeUndefined();
    });

    it('calls Purchases.configure with android api key on android', async () => {
      const { Platform } = require('react-native');
      Platform.OS = 'android';
      (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue(makeCustomerInfo(false));
      (StorageService.storeData as jest.Mock).mockResolvedValue(undefined);
      await MembershipService.initialize();
      expect(Purchases.configure).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: REVENUECAT_API_KEYS.ANDROID })
      );
      Platform.OS = 'ios';
    });
  });

  describe('isActive', () => {
    it('returns true when premium entitlement is active', async () => {
      (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue(makeCustomerInfo(true));
      (StorageService.storeData as jest.Mock).mockResolvedValue(undefined);
      expect(await MembershipService.isActive()).toBe(true);
    });

    it('returns false when no premium entitlement', async () => {
      (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue(makeCustomerInfo(false));
      (StorageService.storeData as jest.Mock).mockResolvedValue(undefined);
      expect(await MembershipService.isActive()).toBe(false);
    });

    it('falls back to local cache when RevenueCat throws', async () => {
      (Purchases.getCustomerInfo as jest.Mock).mockRejectedValue(new Error('offline'));
      (StorageService.getData as jest.Mock).mockResolvedValue({
        isActive: true, type: 'lifetime', expiresAt: null, isTrial: false,
      });
      expect(await MembershipService.isActive()).toBe(true);
    });

    it('returns false from cache when subscription expired', async () => {
      (Purchases.getCustomerInfo as jest.Mock).mockRejectedValue(new Error('offline'));
      const past = new Date(Date.now() - 86400000).toISOString();
      (StorageService.getData as jest.Mock).mockResolvedValue({
        isActive: true, type: 'yearly', expiresAt: past, isTrial: false,
      });
      expect(await MembershipService.isActive()).toBe(false);
    });

    it('returns false when local cache is null', async () => {
      (Purchases.getCustomerInfo as jest.Mock).mockRejectedValue(new Error('offline'));
      (StorageService.getData as jest.Mock).mockResolvedValue(null);
      expect(await MembershipService.isActive()).toBe(false);
    });

    it('returns true from cache when monthly type has future expiry', async () => {
      (Purchases.getCustomerInfo as jest.Mock).mockRejectedValue(new Error('offline'));
      const future = new Date(Date.now() + 86400000).toISOString();
      (StorageService.getData as jest.Mock).mockResolvedValue({
        isActive: true, type: 'monthly', expiresAt: future, isTrial: false,
      });
      expect(await MembershipService.isActive()).toBe(true);
    });

    it('returns false when expiresAt equals current time exactly', async () => {
      jest.useFakeTimers({ now: new Date('2026-01-01T00:00:00.000Z') });
      (Purchases.getCustomerInfo as jest.Mock).mockRejectedValue(new Error('offline'));
      (StorageService.getData as jest.Mock).mockResolvedValue({
        isActive: true, type: 'monthly', expiresAt: '2026-01-01T00:00:00.000Z', isTrial: false,
      });
      expect(await MembershipService.isActive()).toBe(false);
      jest.useRealTimers();
    });

    it('returns false from cache when type is null even if isActive is true', async () => {
      (Purchases.getCustomerInfo as jest.Mock).mockRejectedValue(new Error('offline'));
      (StorageService.getData as jest.Mock).mockResolvedValue({
        isActive: true, type: null, expiresAt: null, isTrial: false,
      });
      expect(await MembershipService.isActive()).toBe(false);
    });
  });

  describe('purchase', () => {
    it('calls purchaseStoreProduct and syncs cache on success', async () => {
      const product = { identifier: 'membership_monthly' };
      (Purchases.getProducts as jest.Mock).mockResolvedValue([product]);
      const customerInfo = makeCustomerInfo(true, 'membership_monthly');
      (Purchases.purchaseStoreProduct as jest.Mock).mockResolvedValue({ customerInfo });
      (StorageService.storeData as jest.Mock).mockResolvedValue(undefined);

      await MembershipService.purchase('membership_monthly');

      expect(Purchases.purchaseStoreProduct).toHaveBeenCalledWith(product);
      expect(StorageService.storeData).toHaveBeenCalledWith(
        STORAGE_KEYS.MEMBERSHIP,
        expect.objectContaining({ isActive: true, type: 'monthly' })
      );
    });

    it('throws when product not found in store', async () => {
      (Purchases.getProducts as jest.Mock).mockResolvedValue([]);
      await expect(MembershipService.purchase('membership_monthly')).rejects.toThrow('Product not found');
    });

    it('throws when purchaseStoreProduct throws', async () => {
      const product = { identifier: 'monthly' };
      (Purchases.getProducts as jest.Mock).mockResolvedValue([product]);
      (Purchases.purchaseStoreProduct as jest.Mock).mockRejectedValue(new Error('network error'));
      await expect(MembershipService.purchase('monthly')).rejects.toThrow('network error');
    });

    it('syncs cache with type yearly for yearly product', async () => {
      const product = { identifier: 'membership_yearly' };
      (Purchases.getProducts as jest.Mock).mockResolvedValue([product]);
      const customerInfo = makeCustomerInfo(true, 'membership_yearly');
      (Purchases.purchaseStoreProduct as jest.Mock).mockResolvedValue({ customerInfo });
      (StorageService.storeData as jest.Mock).mockResolvedValue(undefined);
      await MembershipService.purchase('membership_yearly');
      expect(StorageService.storeData).toHaveBeenCalledWith(
        STORAGE_KEYS.MEMBERSHIP,
        expect.objectContaining({ isActive: true, type: 'yearly' })
      );
    });

    it('syncs cache with type lifetime and null expiresAt for lifetime product', async () => {
      const product = { identifier: 'membership_lifetime' };
      (Purchases.getProducts as jest.Mock).mockResolvedValue([product]);
      const customerInfo = makeCustomerInfo(true, 'membership_lifetime', null);
      (Purchases.purchaseStoreProduct as jest.Mock).mockResolvedValue({ customerInfo });
      (StorageService.storeData as jest.Mock).mockResolvedValue(undefined);
      await MembershipService.purchase('membership_lifetime');
      expect(StorageService.storeData).toHaveBeenCalledWith(
        STORAGE_KEYS.MEMBERSHIP,
        expect.objectContaining({ isActive: true, type: 'lifetime', expiresAt: null })
      );
    });
  });

  describe('restore', () => {
    it('calls restorePurchases and syncs cache', async () => {
      const customerInfo = makeCustomerInfo(true, 'membership_lifetime', null);
      (Purchases.restorePurchases as jest.Mock).mockResolvedValue(customerInfo);
      (StorageService.storeData as jest.Mock).mockResolvedValue(undefined);

      await MembershipService.restore();

      expect(Purchases.restorePurchases).toHaveBeenCalled();
      expect(StorageService.storeData).toHaveBeenCalledWith(
        STORAGE_KEYS.MEMBERSHIP,
        expect.objectContaining({ isActive: true, type: 'lifetime', expiresAt: null })
      );
    });

    it('throws when restorePurchases throws', async () => {
      (Purchases.restorePurchases as jest.Mock).mockRejectedValue(new Error('restore failed'));
      await expect(MembershipService.restore()).rejects.toThrow('restore failed');
    });

    it('syncs cache with isActive false when no entitlement after restore', async () => {
      const customerInfo = makeCustomerInfo(false);
      (Purchases.restorePurchases as jest.Mock).mockResolvedValue(customerInfo);
      (StorageService.storeData as jest.Mock).mockResolvedValue(undefined);
      await MembershipService.restore();
      expect(StorageService.storeData).toHaveBeenCalledWith(
        STORAGE_KEYS.MEMBERSHIP,
        expect.objectContaining({ isActive: false, type: null })
      );
    });
  });

  describe('_syncCache — isTrial', () => {
    it('writes isTrial=true when periodType is trial', async () => {
      const product = { identifier: 'membership_yearly' };
      (Purchases.getProducts as jest.Mock).mockResolvedValue([product]);
      const customerInfo = makeCustomerInfo(true, 'membership_yearly', new Date(Date.now() + 86400000 * 10).toISOString(), 'TRIAL');
      (Purchases.purchaseStoreProduct as jest.Mock).mockResolvedValue({ customerInfo });
      (StorageService.storeData as jest.Mock).mockResolvedValue(undefined);

      await MembershipService.purchase('membership_yearly');

      expect(StorageService.storeData).toHaveBeenCalledWith(
        STORAGE_KEYS.MEMBERSHIP,
        expect.objectContaining({ isTrial: true })
      );
    });

    it('writes isTrial=false when periodType is normal', async () => {
      const product = { identifier: 'membership_monthly' };
      (Purchases.getProducts as jest.Mock).mockResolvedValue([product]);
      const customerInfo = makeCustomerInfo(true, 'membership_monthly', new Date(Date.now() + 86400000).toISOString(), 'NORMAL');
      (Purchases.purchaseStoreProduct as jest.Mock).mockResolvedValue({ customerInfo });
      (StorageService.storeData as jest.Mock).mockResolvedValue(undefined);

      await MembershipService.purchase('membership_monthly');

      expect(StorageService.storeData).toHaveBeenCalledWith(
        STORAGE_KEYS.MEMBERSHIP,
        expect.objectContaining({ isTrial: false })
      );
    });

    it('does not crash when reading legacy cache without isTrial field', async () => {
      (Purchases.getCustomerInfo as jest.Mock).mockRejectedValue(new Error('offline'));
      (StorageService.getData as jest.Mock).mockResolvedValue({
        isActive: true, type: 'lifetime', expiresAt: null,
        // 故意省略 isTrial，模拟旧缓存
      });
      expect(await MembershipService.isActive()).toBe(true);
    });
  });

  describe('getAvailablePackages', () => {
    function makeOfferings(packages: any[]) {
      return { current: { availablePackages: packages } };
    }

    it('returns mapped packages from current offering', async () => {
      (Purchases.getOfferings as jest.Mock).mockResolvedValue(makeOfferings([
        { product: { identifier: 'monthly', priceString: '$2.99', introPrice: { price: 0 } }, packageType: 'MONTHLY' },
        { product: { identifier: 'yearly', priceString: '$19.99', introPrice: { price: 0 } }, packageType: 'ANNUAL' },
        { product: { identifier: 'lifetime', priceString: '$49.99', introPrice: null }, packageType: 'LIFETIME' },
      ]));
      const result = await MembershipService.getAvailablePackages();
      expect(result).toEqual([
        { productId: 'monthly', packageType: 'MONTHLY', priceString: '$2.99', hasIntroOffer: true },
        { productId: 'yearly', packageType: 'ANNUAL', priceString: '$19.99', hasIntroOffer: true },
        { productId: 'lifetime', packageType: 'LIFETIME', priceString: '$49.99', hasIntroOffer: false },
      ]);
    });

    it('returns empty array when current offering is null', async () => {
      (Purchases.getOfferings as jest.Mock).mockResolvedValue({ current: null });
      const result = await MembershipService.getAvailablePackages();
      expect(result).toEqual([]);
    });

    it('returns empty array when availablePackages is empty', async () => {
      (Purchases.getOfferings as jest.Mock).mockResolvedValue(makeOfferings([]));
      const result = await MembershipService.getAvailablePackages();
      expect(result).toEqual([]);
    });
  });
});
