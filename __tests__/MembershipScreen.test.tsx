import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import MembershipScreen from '../src/screens/MembershipScreen';
import MembershipService from '../src/services/MembershipService';
import useMembershipHook from '../src/hooks/useMembership';

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

      await act(async () => { fireEvent.press(getByText('membership.subscribe')); });

      expect(purchase).toHaveBeenCalledWith('yearly');
    });

    it('tapping monthly plan then subscribe calls purchase with monthly', async () => {
      const purchase = jest.fn().mockResolvedValue(undefined);
      mockUseMembership.mockReturnValue(makeDefaultHookState({ purchase }));
      const { getByText } = render(<MembershipScreen navigation={makeNavigation()} />);

      fireEvent.press(getByText('membership.planMonthlyLabel'));
      await act(async () => { fireEvent.press(getByText('membership.subscribe')); });

      expect(purchase).toHaveBeenCalledWith('monthly');
    });

    it('tapping lifetime plan then subscribe calls purchase with lifetime', async () => {
      const purchase = jest.fn().mockResolvedValue(undefined);
      mockUseMembership.mockReturnValue(makeDefaultHookState({ purchase }));
      const { getByText } = render(<MembershipScreen navigation={makeNavigation()} />);

      fireEvent.press(getByText('membership.planLifetimeLabel'));
      await act(async () => { fireEvent.press(getByText('membership.subscribe')); });

      expect(purchase).toHaveBeenCalledWith('lifetime');
    });
  });

  describe('购买按钮状态', () => {
    it('hides subscribe text and shows loading when isLoading is true', () => {
      mockUseMembership.mockReturnValue(makeDefaultHookState({ isLoading: true }));
      const { queryByText } = render(<MembershipScreen navigation={makeNavigation()} />);
      expect(queryByText('membership.subscribe')).toBeNull();
    });
  });
});
