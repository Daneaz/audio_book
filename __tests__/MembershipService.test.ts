import MembershipService from '../src/services/MembershipService';
import StorageService from '../src/services/StorageService';
import Purchases from 'react-native-purchases';
import { STORAGE_KEYS, MEMBERSHIP_ENTITLEMENT } from '../src/utils/constants';

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
    purchaseStoreProduct: jest.fn(),
    restorePurchases: jest.fn(),
    addCustomerInfoUpdateListener: jest.fn(),
  },
}));

function makeCustomerInfo(
  entitlementActive: boolean,
  productId = 'membership_monthly',
  expirationDate: string | null = new Date(Date.now() + 86400000).toISOString()
) {
  const active: Record<string, any> = {};
  if (entitlementActive) {
    active[MEMBERSHIP_ENTITLEMENT] = { productIdentifier: productId, expirationDate };
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
        isActive: true, type: 'lifetime', expiresAt: null,
      });
      expect(await MembershipService.isActive()).toBe(true);
    });

    it('returns false from cache when subscription expired', async () => {
      (Purchases.getCustomerInfo as jest.Mock).mockRejectedValue(new Error('offline'));
      const past = new Date(Date.now() - 86400000).toISOString();
      (StorageService.getData as jest.Mock).mockResolvedValue({
        isActive: true, type: 'yearly', expiresAt: past,
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
  });
});
