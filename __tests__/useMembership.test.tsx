import { renderHook, act, waitFor } from '@testing-library/react-native';
import Purchases from 'react-native-purchases';
import MembershipService from '../src/services/MembershipService';
import useMembership from '../src/hooks/useMembership';
import { MEMBERSHIP_ENTITLEMENT } from '../src/utils/constants';

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

describe('useMembership', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (MembershipService.isActive as jest.Mock).mockResolvedValue(false);
    (Purchases.addCustomerInfoUpdateListener as jest.Mock).mockImplementation(() => {});
    (Purchases.removeCustomerInfoUpdateListener as jest.Mock).mockImplementation(() => {});
  });

  describe('初始状态', () => {
    it('returns default state before effects resolve', () => {
      const { result } = renderHook(() => useMembership());
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe(null);
      expect(result.current.membershipType).toBe(null);
      expect(result.current.expiresAt).toBe(null);
    });
  });

  describe('挂载行为', () => {
    it('calls MembershipService.isActive on mount and updates isActive', async () => {
      (MembershipService.isActive as jest.Mock).mockResolvedValue(true);
      const { result } = renderHook(() => useMembership());
      await waitFor(() => expect(result.current.isActive).toBe(true));
      expect(MembershipService.isActive).toHaveBeenCalledTimes(1);
    });

    it('registers CustomerInfo update listener on mount', () => {
      renderHook(() => useMembership());
      expect(Purchases.addCustomerInfoUpdateListener).toHaveBeenCalledTimes(1);
    });

    it('removes listener on unmount', () => {
      const { unmount } = renderHook(() => useMembership());
      unmount();
      expect(Purchases.removeCustomerInfoUpdateListener).toHaveBeenCalledTimes(1);
    });
  });

  describe('CustomerInfo 更新监听器', () => {
    it('updates to lifetime when listener fires with lifetime entitlement', () => {
      let capturedListener: ((info: any) => void) | undefined;
      (Purchases.addCustomerInfoUpdateListener as jest.Mock).mockImplementation((cb) => {
        capturedListener = cb;
      });
      const { result } = renderHook(() => useMembership());

      act(() => {
        capturedListener!(makeCustomerInfo(true, 'membership_lifetime', null));
      });

      expect(result.current.isActive).toBe(true);
      expect(result.current.membershipType).toBe('lifetime');
      expect(result.current.expiresAt).toBe(null);
    });

    it('updates to yearly when listener fires with yearly entitlement', () => {
      let capturedListener: ((info: any) => void) | undefined;
      (Purchases.addCustomerInfoUpdateListener as jest.Mock).mockImplementation((cb) => {
        capturedListener = cb;
      });
      const expiresAt = new Date(Date.now() + 86400000).toISOString();
      const { result } = renderHook(() => useMembership());

      act(() => {
        capturedListener!(makeCustomerInfo(true, 'membership_yearly', expiresAt));
      });

      expect(result.current.isActive).toBe(true);
      expect(result.current.membershipType).toBe('yearly');
      expect(result.current.expiresAt).toBe(expiresAt);
    });

    it('resets state when listener fires with no active entitlement', () => {
      let capturedListener: ((info: any) => void) | undefined;
      (Purchases.addCustomerInfoUpdateListener as jest.Mock).mockImplementation((cb) => {
        capturedListener = cb;
      });
      const { result } = renderHook(() => useMembership());

      act(() => { capturedListener!(makeCustomerInfo(false)); });

      expect(result.current.isActive).toBe(false);
      expect(result.current.membershipType).toBe(null);
    });
  });
});
