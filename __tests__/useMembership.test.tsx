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
  expirationDate: string | null = new Date(Date.now() + 86400000).toISOString(),
  periodType: string = 'NORMAL'
) {
  const active: Record<string, any> = {};
  if (entitlementActive) {
    active[MEMBERSHIP_ENTITLEMENT] = { productIdentifier: productId, expirationDate, periodType };
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
      expect(result.current.isTrial).toBe(false);
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
      expect(result.current.isTrial).toBe(false);
    });

    it('sets isTrial=true when listener fires with periodType trial', () => {
      let capturedListener: ((info: any) => void) | undefined;
      (Purchases.addCustomerInfoUpdateListener as jest.Mock).mockImplementation((cb) => {
        capturedListener = cb;
      });
      const expiresAt = new Date(Date.now() + 86400000 * 10).toISOString();
      const { result } = renderHook(() => useMembership());

      act(() => {
        capturedListener!(makeCustomerInfo(true, 'membership_yearly', expiresAt, 'TRIAL'));
      });

      expect(result.current.isTrial).toBe(true);
    });

    it('sets isTrial=false when listener fires with periodType normal', () => {
      let capturedListener: ((info: any) => void) | undefined;
      (Purchases.addCustomerInfoUpdateListener as jest.Mock).mockImplementation((cb) => {
        capturedListener = cb;
      });
      const { result } = renderHook(() => useMembership());

      act(() => {
        capturedListener!(makeCustomerInfo(true, 'membership_monthly'));
      });

      expect(result.current.isTrial).toBe(false);
    });

    it('resets isTrial to false when listener fires with periodType NORMAL after TRIAL', () => {
      let capturedListener: ((info: any) => void) | undefined;
      (Purchases.addCustomerInfoUpdateListener as jest.Mock).mockImplementation((cb) => {
        capturedListener = cb;
      });
      const expiresAt = new Date(Date.now() + 86400000 * 10).toISOString();
      const { result } = renderHook(() => useMembership());

      act(() => {
        capturedListener!(makeCustomerInfo(true, 'membership_yearly', expiresAt, 'TRIAL'));
      });
      expect(result.current.isTrial).toBe(true);

      act(() => {
        capturedListener!(makeCustomerInfo(true, 'membership_yearly', expiresAt, 'NORMAL'));
      });
      expect(result.current.isTrial).toBe(false);
    });
  });

  describe('purchase()', () => {
    it('sets isLoading true during purchase and false after success', async () => {
      let resolvePurchase!: () => void;
      (MembershipService.purchase as jest.Mock).mockImplementation(
        () => new Promise<void>(resolve => { resolvePurchase = resolve; })
      );
      const { result } = renderHook(() => useMembership());

      act(() => { result.current.purchase('monthly'); });
      expect(result.current.isLoading).toBe(true);

      await act(async () => { resolvePurchase(); });
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('sets error message and rethrows when purchase fails', async () => {
      (MembershipService.purchase as jest.Mock).mockRejectedValue(new Error('payment declined'));
      const { result } = renderHook(() => useMembership());

      let threwError = false;
      await act(async () => {
        try {
          await result.current.purchase('monthly');
        } catch {
          threwError = true;
        }
      });

      expect(threwError).toBe(true);
      expect(result.current.error).toBe('payment declined');
    });

    it('sets isLoading false in finally even when purchase throws', async () => {
      (MembershipService.purchase as jest.Mock).mockRejectedValue(new Error('fail'));
      const { result } = renderHook(() => useMembership());

      await act(async () => {
        try { await result.current.purchase('monthly'); } catch {}
      });

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('restore()', () => {
    it('sets isLoading true during restore and false after success', async () => {
      let resolveRestore!: () => void;
      (MembershipService.restore as jest.Mock).mockImplementation(
        () => new Promise<void>(resolve => { resolveRestore = resolve; })
      );
      const { result } = renderHook(() => useMembership());

      act(() => { result.current.restore(); });
      expect(result.current.isLoading).toBe(true);

      await act(async () => { resolveRestore(); });
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('sets error message and rethrows when restore fails', async () => {
      (MembershipService.restore as jest.Mock).mockRejectedValue(new Error('no purchases found'));
      const { result } = renderHook(() => useMembership());

      let threwError = false;
      await act(async () => {
        try {
          await result.current.restore();
        } catch {
          threwError = true;
        }
      });

      expect(threwError).toBe(true);
      expect(result.current.error).toBe('no purchases found');
    });

    it('sets isLoading false in finally even when restore throws', async () => {
      (MembershipService.restore as jest.Mock).mockRejectedValue(new Error('fail'));
      const { result } = renderHook(() => useMembership());

      await act(async () => {
        try { await result.current.restore(); } catch {}
      });

      expect(result.current.isLoading).toBe(false);
    });
  });
});
