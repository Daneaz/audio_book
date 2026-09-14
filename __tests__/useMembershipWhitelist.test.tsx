import { renderHook, act, waitFor } from '@testing-library/react-native';
import Purchases from 'react-native-purchases';
import MembershipService from '../src/services/MembershipService';
import useMembership from '../src/hooks/useMembership';

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

jest.mock('react-native-google-mobile-ads', () => ({
  TestIds: { BANNER: 'test-banner-id', REWARDED: 'test-rewarded-id' },
  BannerAd: 'BannerAd',
  BannerAdSize: { BANNER: 'BANNER' },
}));

jest.mock('../src/services/MembershipService', () => ({
  __esModule: true,
  default: {
    isActive: jest.fn(),
    isWhitelistedDevice: jest.fn(),
    purchase: jest.fn(),
    restore: jest.fn(),
  },
}));

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    addCustomerInfoUpdateListener: jest.fn(),
    removeCustomerInfoUpdateListener: jest.fn(),
  },
}));

const emptyCustomerInfo = { entitlements: { active: {} } } as any;

describe('useMembership 设备白名单', () => {
  let listener: (info: any) => void;

  beforeEach(() => {
    jest.clearAllMocks();
    (Purchases.addCustomerInfoUpdateListener as jest.Mock).mockImplementation(fn => { listener = fn; });
    (Purchases.removeCustomerInfoUpdateListener as jest.Mock).mockImplementation(() => {});
  });

  it('白名单设备显示为终身会员', async () => {
    (MembershipService.isActive as jest.Mock).mockResolvedValue(true);
    (MembershipService.isWhitelistedDevice as jest.Mock).mockResolvedValue(true);

    const { result } = renderHook(() => useMembership());

    await waitFor(() => expect(result.current.isActive).toBe(true));
    await waitFor(() => expect(result.current.membershipType).toBe('lifetime'));
  });

  it('白名单设备不会被 RevenueCat 的空 entitlement 推送覆盖', async () => {
    (MembershipService.isActive as jest.Mock).mockResolvedValue(true);
    (MembershipService.isWhitelistedDevice as jest.Mock).mockResolvedValue(true);

    const { result } = renderHook(() => useMembership());
    await waitFor(() => expect(result.current.isActive).toBe(true));

    await act(async () => { listener(emptyCustomerInfo); });

    expect(result.current.isActive).toBe(true);
    expect(result.current.membershipType).toBe('lifetime');
  });

  it('非白名单设备仍然被 RevenueCat 推送更新为非会员', async () => {
    (MembershipService.isActive as jest.Mock).mockResolvedValue(false);
    (MembershipService.isWhitelistedDevice as jest.Mock).mockResolvedValue(false);

    const { result } = renderHook(() => useMembership());
    await act(async () => { listener(emptyCustomerInfo); });

    expect(result.current.isActive).toBe(false);
    expect(result.current.membershipType).toBe(null);
  });
});
