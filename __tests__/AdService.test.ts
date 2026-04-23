import AdService from '../src/services/AdService';
import StorageService from '../src/services/StorageService';
import MembershipService from '../src/services/MembershipService';
import { STORAGE_KEYS } from '../src/utils/constants';

jest.mock('../src/services/StorageService', () => ({
  __esModule: true,
  default: {
    getData: jest.fn(),
    storeData: jest.fn(),
  },
}));

jest.mock('../src/services/MembershipService', () => ({
  __esModule: true,
  default: {
    isActive: jest.fn(),
  },
}));

jest.mock('react-native-google-mobile-ads', () => ({
  RewardedAd: {
    createForAdRequest: jest.fn(),
  },
  RewardedAdEventType: {
    LOADED: 'loaded',
    EARNED_REWARD: 'earned_reward',
    ERROR: 'error',
  },
  TestIds: {
    BANNER: 'test-banner-id',
    REWARDED: 'test-rewarded-id',
  },
  BannerAd: 'BannerAd',
  BannerAdSize: { BANNER: 'BANNER' },
}));

describe('AdService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('shouldShowBanner', () => {
    it('returns false when user is a member', async () => {
      (MembershipService.isActive as jest.Mock).mockResolvedValue(true);
      expect(await AdService.shouldShowBanner()).toBe(false);
    });

    it('returns false when banner is hidden within 1 hour', async () => {
      (MembershipService.isActive as jest.Mock).mockResolvedValue(false);
      const future = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      (StorageService.getData as jest.Mock).mockResolvedValue({
        bannerHiddenUntil: future,
      });
      expect(await AdService.shouldShowBanner()).toBe(false);
    });

    it('returns true when banner hidden time has passed', async () => {
      (MembershipService.isActive as jest.Mock).mockResolvedValue(false);
      const past = new Date(Date.now() - 1000).toISOString();
      (StorageService.getData as jest.Mock).mockResolvedValue({
        bannerHiddenUntil: past,
      });
      expect(await AdService.shouldShowBanner()).toBe(true);
    });

    it('returns true when non-member with no ad state', async () => {
      (MembershipService.isActive as jest.Mock).mockResolvedValue(false);
      (StorageService.getData as jest.Mock).mockResolvedValue(null);
      expect(await AdService.shouldShowBanner()).toBe(true);
    });
  });

  describe('hideBannerForOneHour', () => {
    it('writes bannerHiddenUntil ~1 hour from now', async () => {
      (MembershipService.isActive as jest.Mock).mockResolvedValue(false);
      (StorageService.getData as jest.Mock).mockResolvedValue(null);

      await AdService.hideBannerForOneHour();

      const call = (StorageService.storeData as jest.Mock).mock.calls[0];
      expect(call[0]).toBe(STORAGE_KEYS.AD_STATE);
      const writtenTime = new Date(call[1].bannerHiddenUntil).getTime();
      const expectedTime = Date.now() + 60 * 60 * 1000;
      expect(Math.abs(writtenTime - expectedTime)).toBeLessThan(1000);
    });
  });
});
