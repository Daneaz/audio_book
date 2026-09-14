import MembershipService from '../src/services/MembershipService';
import Purchases from 'react-native-purchases';
import { getDeviceId } from '../src/utils/deviceId';

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

jest.mock('react-native-google-mobile-ads', () => ({
  TestIds: { BANNER: 'test-banner-id', REWARDED: 'test-rewarded-id' },
  BannerAd: 'BannerAd',
  BannerAdSize: { BANNER: 'BANNER' },
}));

jest.mock('../src/utils/constants', () => ({
  ...jest.requireActual('../src/utils/constants'),
  MEMBERSHIP_DEVICE_WHITELIST: ['IDFV-OWNER'],
}));

jest.mock('../src/utils/deviceId', () => ({
  __esModule: true,
  getDeviceId: jest.fn(),
}));

jest.mock('../src/services/StorageService', () => ({
  __esModule: true,
  default: { getData: jest.fn(), storeData: jest.fn() },
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

describe('MembershipService 设备白名单', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue({ entitlements: { active: {} } });
  });

  it('白名单设备直接算会员，不调用 RevenueCat', async () => {
    (getDeviceId as jest.Mock).mockResolvedValue('IDFV-OWNER');

    await expect(MembershipService.isActive()).resolves.toBe(true);
    expect(Purchases.getCustomerInfo).not.toHaveBeenCalled();
  });

  it('白名单匹配忽略大小写和首尾空格', async () => {
    (getDeviceId as jest.Mock).mockResolvedValue('  idfv-owner  ');

    await expect(MembershipService.isActive()).resolves.toBe(true);
  });

  it('非白名单设备仍然走 RevenueCat', async () => {
    (getDeviceId as jest.Mock).mockResolvedValue('IDFV-SOMEONE-ELSE');

    await expect(MembershipService.isActive()).resolves.toBe(false);
    expect(Purchases.getCustomerInfo).toHaveBeenCalled();
  });

  it('拿不到设备 ID 时不影响正常付费判断', async () => {
    (getDeviceId as jest.Mock).mockResolvedValue(null);

    await expect(MembershipService.isActive()).resolves.toBe(false);
    expect(Purchases.getCustomerInfo).toHaveBeenCalled();
  });
});
