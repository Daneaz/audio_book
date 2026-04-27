import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { Alert, Linking } from 'react-native';
import MembershipScreen from '../src/screens/MembershipScreen';
import MembershipService from '../src/services/MembershipService';
import useMembershipHook from '../src/hooks/useMembership';

jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as any);

jest.mock('react-native-google-mobile-ads', () => ({
  TestIds: { BANNER: 'test-banner-id', REWARDED: 'test-rewarded-id' },
  BannerAd: 'BannerAd',
  BannerAdSize: { BANNER: 'BANNER' },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('../src/i18n', () => ({
  __esModule: true,
  default: () => ({ t: (key: string) => key }),
}));

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    addCustomerInfoUpdateListener: jest.fn(),
    removeCustomerInfoUpdateListener: jest.fn(),
    getCustomerInfo: jest.fn(),
    purchaseStoreProduct: jest.fn(),
    getProducts: jest.fn(),
    restorePurchases: jest.fn(),
  },
}));

jest.mock('../src/hooks/useMembership');
const mockUseMembership = useMembershipHook as jest.MockedFunction<typeof useMembershipHook>;

jest.mock('../src/services/MembershipService', () => ({
  __esModule: true,
  default: { getProductPrices: jest.fn() },
}));

const makeDefaultHookState = (overrides = {}) => ({
  isActive: false,
  membershipType: null as null,
  expiresAt: null as null,
  isTrial: false,
  isLoading: false,
  error: null as null,
  purchase: jest.fn().mockResolvedValue(undefined),
  restore: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

function makeNavigation() {
  return { goBack: jest.fn() };
}

describe('MembershipScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseMembership.mockReturnValue(makeDefaultHookState());
    (MembershipService.getProductPrices as jest.Mock).mockResolvedValue({});
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('渲染', () => {
    it('renders all three plan options', () => {
      const { getByText } = render(<MembershipScreen navigation={makeNavigation()} />);
      expect(getByText('membership.planMonthlyLabel')).toBeTruthy();
      expect(getByText('membership.planYearlyLabel')).toBeTruthy();
      expect(getByText('membership.planLifetimeLabel')).toBeTruthy();
    });

    it('shows -- for all plan prices when not yet loaded', () => {
      (MembershipService.getProductPrices as jest.Mock).mockReturnValue(new Promise(() => {}));
      const { getAllByText } = render(<MembershipScreen navigation={makeNavigation()} />);
      expect(getAllByText('--').length).toBeGreaterThanOrEqual(3);
    });

    it('shows price with suffix after prices load', async () => {
      (MembershipService.getProductPrices as jest.Mock).mockResolvedValue({
        monthly: '$2.99',
        yearly: '$19.99',
        lifetime: '$49.99',
      });
      const { findByText } = render(<MembershipScreen navigation={makeNavigation()} />);
      await findByText('$2.99membership.perMonth');
      await findByText('$19.99membership.perYear');
      await findByText('$49.99');
    });
  });

  describe('套餐选择', () => {
    it('default selection is yearly — subscribe button calls purchase with yearly', async () => {
      const purchase = jest.fn().mockResolvedValue(undefined);
      mockUseMembership.mockReturnValue(makeDefaultHookState({ purchase }));
      const { getByText } = render(<MembershipScreen navigation={makeNavigation()} />);

      await act(async () => { fireEvent.press(getByText('membership.freeTrial')); });

      expect(purchase).toHaveBeenCalledWith('yearly');
    });

    it('tapping monthly plan then subscribe calls purchase with monthly', async () => {
      const purchase = jest.fn().mockResolvedValue(undefined);
      mockUseMembership.mockReturnValue(makeDefaultHookState({ purchase }));
      const { getByText } = render(<MembershipScreen navigation={makeNavigation()} />);

      fireEvent.press(getByText('membership.planMonthlyLabel'));
      await act(async () => { fireEvent.press(getByText('membership.freeTrial')); });

      expect(purchase).toHaveBeenCalledWith('monthly');
    });

    it('tapping lifetime plan shows buyNow button and calls purchase with lifetime', async () => {
      const purchase = jest.fn().mockResolvedValue(undefined);
      mockUseMembership.mockReturnValue(makeDefaultHookState({ purchase }));
      const { getByText } = render(<MembershipScreen navigation={makeNavigation()} />);

      fireEvent.press(getByText('membership.planLifetimeLabel'));
      await act(async () => { fireEvent.press(getByText('membership.buyNow')); });

      expect(purchase).toHaveBeenCalledWith('lifetime');
    });
  });

  describe('购买按钮状态', () => {
    it('hides subscribe text and shows loading when isLoading is true', () => {
      mockUseMembership.mockReturnValue(makeDefaultHookState({ isLoading: true }));
      const { queryByText } = render(<MembershipScreen navigation={makeNavigation()} />);
      expect(queryByText('membership.freeTrial')).toBeNull();
      expect(queryByText('membership.buyNow')).toBeNull();
    });
  });

  describe('handlePurchase — 核心支付路径', () => {
    it('calls navigation.goBack after successful purchase', async () => {
      const purchase = jest.fn().mockResolvedValue(undefined);
      mockUseMembership.mockReturnValue(makeDefaultHookState({ purchase }));
      const navigation = makeNavigation();
      const { getByText } = render(<MembershipScreen navigation={navigation} />);

      await act(async () => { fireEvent.press(getByText('membership.freeTrial')); });

      expect(navigation.goBack).toHaveBeenCalledTimes(1);
    });

    it('does NOT show Alert when error has userCancelled=true', async () => {
      const cancelError = Object.assign(new Error('cancelled'), { userCancelled: true });
      const purchase = jest.fn().mockRejectedValue(cancelError);
      mockUseMembership.mockReturnValue(makeDefaultHookState({ purchase }));
      const { getByText } = render(<MembershipScreen navigation={makeNavigation()} />);

      await act(async () => { fireEvent.press(getByText('membership.freeTrial')); });

      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('does NOT show Alert when error message contains "cancel"', async () => {
      const cancelError = new Error('User cancelled the purchase');
      const purchase = jest.fn().mockRejectedValue(cancelError);
      mockUseMembership.mockReturnValue(makeDefaultHookState({ purchase }));
      const { getByText } = render(<MembershipScreen navigation={makeNavigation()} />);

      await act(async () => { fireEvent.press(getByText('membership.freeTrial')); });

      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('shows Alert with error message for real payment failure', async () => {
      const paymentError = new Error('Payment method declined');
      const purchase = jest.fn().mockRejectedValue(paymentError);
      mockUseMembership.mockReturnValue(makeDefaultHookState({ purchase }));
      const { getByText } = render(<MembershipScreen navigation={makeNavigation()} />);

      await act(async () => { fireEvent.press(getByText('membership.freeTrial')); });

      expect(Alert.alert).toHaveBeenCalledWith(
        'membership.purchaseFailed',
        'Payment method declined'
      );
    });
  });

  describe('handleRestore — 恢复购买', () => {
    it('shows success Alert when restore succeeds', async () => {
      const restore = jest.fn().mockResolvedValue(undefined);
      mockUseMembership.mockReturnValue(makeDefaultHookState({ restore }));
      const { getByText } = render(<MembershipScreen navigation={makeNavigation()} />);

      await act(async () => { fireEvent.press(getByText('membership.restore')); });

      expect(Alert.alert).toHaveBeenCalledWith(
        'membership.restoreSuccess',
        'membership.restoreSuccessMsg',
        expect.arrayContaining([
          expect.objectContaining({ text: 'common.ok' }),
        ])
      );
    });

    it('calls navigation.goBack when OK is pressed on success Alert', async () => {
      const restore = jest.fn().mockResolvedValue(undefined);
      mockUseMembership.mockReturnValue(makeDefaultHookState({ restore }));
      const navigation = makeNavigation();
      const { getByText } = render(<MembershipScreen navigation={navigation} />);

      await act(async () => { fireEvent.press(getByText('membership.restore')); });

      const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
      const buttons: any[] = alertCall[2];
      const okButton = buttons.find((b: any) => b.text === 'common.ok');

      act(() => { okButton.onPress(); });

      expect(navigation.goBack).toHaveBeenCalledTimes(1);
    });

    it('shows failure Alert when restore throws', async () => {
      const restore = jest.fn().mockRejectedValue(new Error('No purchases found'));
      mockUseMembership.mockReturnValue(makeDefaultHookState({ restore }));
      const { getByText } = render(<MembershipScreen navigation={makeNavigation()} />);

      await act(async () => { fireEvent.press(getByText('membership.restore')); });

      expect(Alert.alert).toHaveBeenCalledWith(
        'membership.restoreFailed',
        'No purchases found'
      );
    });
  });

  describe('试用状态', () => {
    it('shows trial banner when isTrial is true', () => {
      const expiresAt = new Date(Date.now() + 86400000 * 10).toISOString();
      mockUseMembership.mockReturnValue(
        makeDefaultHookState({ isActive: true, isTrial: true, expiresAt })
      );
      const { getByTestId } = render(<MembershipScreen navigation={makeNavigation()} />);
      expect(getByTestId('trial-banner')).toBeTruthy();
    });

    it('does not show trial banner when isTrial is false', () => {
      mockUseMembership.mockReturnValue(makeDefaultHookState({ isActive: false, isTrial: false }));
      const { queryByTestId } = render(<MembershipScreen navigation={makeNavigation()} />);
      expect(queryByTestId('trial-banner')).toBeNull();
    });

    it('shows manageSubscription button when isTrial is true', () => {
      const expiresAt = new Date(Date.now() + 86400000 * 5).toISOString();
      mockUseMembership.mockReturnValue(
        makeDefaultHookState({ isActive: true, isTrial: true, expiresAt })
      );
      const { getByText } = render(<MembershipScreen navigation={makeNavigation()} />);
      expect(getByText('membership.manageSubscription')).toBeTruthy();
    });

    it('tapping manageSubscription calls Linking.openURL and does not call purchase', async () => {
      const purchase = jest.fn();
      const expiresAt = new Date(Date.now() + 86400000 * 5).toISOString();
      mockUseMembership.mockReturnValue(
        makeDefaultHookState({ isActive: true, isTrial: true, expiresAt, purchase })
      );
      const navigation = makeNavigation();
      const { getByText } = render(<MembershipScreen navigation={navigation} />);

      await act(async () => { fireEvent.press(getByText('membership.manageSubscription')); });

      expect(Linking.openURL).toHaveBeenCalledWith('https://apps.apple.com/account/subscriptions');
      expect(purchase).not.toHaveBeenCalled();
      expect(navigation.goBack).not.toHaveBeenCalled();
    });
  });
});
