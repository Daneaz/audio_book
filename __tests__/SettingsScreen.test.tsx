import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import SettingsScreen from '../src/screens/SettingsScreen';
import useMembershipHook from '../src/hooks/useMembership';

jest.mock('react-native-google-mobile-ads', () => ({
  TestIds: { BANNER: 'test-banner-id', REWARDED: 'test-rewarded-id' },
  BannerAd: 'BannerAd',
  BannerAdSize: { BANNER: 'BANNER' },
}));

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../src/services/MembershipService', () => ({
  __esModule: true,
  default: {
    isActive: jest.fn().mockResolvedValue(false),
    purchase: jest.fn(),
    restore: jest.fn(),
  },
}));

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    addCustomerInfoUpdateListener: jest.fn(),
    removeCustomerInfoUpdateListener: jest.fn(),
    getCustomerInfo: jest.fn(),
  },
}));

jest.mock('../src/i18n', () => ({
  __esModule: true,
  default: () => ({ t: (key: string) => key, language: 'zh' }),
}));

jest.mock('../src/hooks/useSettings', () => ({
  __esModule: true,
  default: () => ({
    settings: {
      theme: 'system', language: 'zh', fontSize: 18, lineSpacing: 1.8,
      fontPreset: 'hei', readingMode: 'scroll', autoFlipInterval: 5,
      speechRate: 1.0, voiceType: 'default',
    },
    updateSettings: jest.fn(),
    loading: false,
  }),
}));

jest.mock('expo-speech', () => ({
  getAvailableVoicesAsync: jest.fn().mockResolvedValue([]),
  stop: jest.fn(),
  speak: jest.fn(),
}));

jest.mock('expo-updates', () => ({
  channel: 'production',
  runtimeVersion: '1.0.0',
}));

jest.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}));

jest.mock('../src/hooks/useMembership');
const mockUseMembership = useMembershipHook as jest.MockedFunction<typeof useMembershipHook>;

const makeHookState = (overrides = {}) => ({
  isActive: false,
  membershipType: null as null,
  expiresAt: null as null,
  isTrial: false,
  isLoading: false,
  error: null as null,
  purchase: jest.fn(),
  restore: jest.fn(),
  ...overrides,
});

function makeNavigation() {
  return { navigate: jest.fn(), goBack: jest.fn() };
}

describe('SettingsScreen — 会员入口行', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseMembership.mockReturnValue(makeHookState());
  });

  it('shows upgrade badge when not a member', () => {
    const { getByText } = render(<SettingsScreen navigation={makeNavigation()} />);
    expect(getByText('membership.upgrade')).toBeTruthy();
  });

  it('shows trial status when isTrial is true', () => {
    const expiresAt = new Date(Date.now() + 86400000 * 5).toISOString();
    mockUseMembership.mockReturnValue(makeHookState({ isActive: true, isTrial: true, expiresAt }));
    const { getByTestId } = render(<SettingsScreen navigation={makeNavigation()} />);
    expect(getByTestId('membership-trial-badge')).toBeTruthy();
  });

  it('shows subscribed badge when active and not in trial', () => {
    mockUseMembership.mockReturnValue(
      makeHookState({ isActive: true, isTrial: false, membershipType: 'yearly' })
    );
    const { getByText } = render(<SettingsScreen navigation={makeNavigation()} />);
    expect(getByText('membership.subscribed')).toBeTruthy();
  });

  it('navigates to Membership screen on row press', () => {
    const navigation = makeNavigation();
    const { getByTestId } = render(<SettingsScreen navigation={navigation} />);
    fireEvent.press(getByTestId('membership-row'));
    expect(navigation.navigate).toHaveBeenCalledWith('Membership');
  });
});
