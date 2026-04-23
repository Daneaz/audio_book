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
    LOADED: 'rewarded_loaded',
    EARNED_REWARD: 'rewarded_earned_reward',
  },
  AdEventType: {
    ERROR: 'error',
    CLOSED: 'closed',
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
      await AdService.hideBannerForOneHour();

      const call = (StorageService.storeData as jest.Mock).mock.calls[0];
      expect(call[0]).toBe(STORAGE_KEYS.AD_STATE);
      const writtenTime = new Date(call[1].bannerHiddenUntil).getTime();
      const expectedTime = Date.now() + 60 * 60 * 1000;
      expect(Math.abs(writtenTime - expectedTime)).toBeLessThan(1000);
    });
  });

  describe('showRewardedAd', () => {
    function makeMockRewardedAd() {
      const listeners: Record<string, ((...args: any[]) => void)[]> = {};
      return {
        addAdEventListener: jest.fn((event: string, cb: (...args: any[]) => void) => {
          if (!listeners[event]) listeners[event] = [];
          listeners[event].push(cb);
          return () => {
            listeners[event] = listeners[event].filter(fn => fn !== cb);
          };
        }),
        load: jest.fn(),
        show: jest.fn().mockResolvedValue(undefined),
        emit: (event: string, ...args: any[]) => {
          (listeners[event] || []).forEach(cb => cb(...args));
        },
        listenerCount: (event: string) => (listeners[event] || []).length,
      };
    }

    it('resolves and calls hideBannerForOneHour when user earns reward', async () => {
      const mockAd = makeMockRewardedAd();
      const { RewardedAd } = jest.requireMock('react-native-google-mobile-ads');
      (RewardedAd.createForAdRequest as jest.Mock).mockReturnValue(mockAd);
      (StorageService.storeData as jest.Mock).mockResolvedValue(undefined);

      const promise = AdService.showRewardedAd();
      mockAd.emit('rewarded_loaded');
      await Promise.resolve();
      mockAd.emit('rewarded_earned_reward');
      await promise;

      expect(StorageService.storeData).toHaveBeenCalledWith(
        STORAGE_KEYS.AD_STATE,
        expect.objectContaining({ bannerHiddenUntil: expect.any(String) })
      );
    });

    it('rejects when load fails', async () => {
      const mockAd = makeMockRewardedAd();
      const { RewardedAd } = jest.requireMock('react-native-google-mobile-ads');
      (RewardedAd.createForAdRequest as jest.Mock).mockReturnValue(mockAd);

      const loadError = new Error('load failed');
      const promise = AdService.showRewardedAd();
      mockAd.emit('error', loadError);

      await expect(promise).rejects.toThrow('load failed');
    });

    it('rejects when show fails', async () => {
      const mockAd = makeMockRewardedAd();
      const { RewardedAd } = jest.requireMock('react-native-google-mobile-ads');
      (RewardedAd.createForAdRequest as jest.Mock).mockReturnValue(mockAd);

      const showError = new Error('show failed');
      mockAd.show.mockRejectedValue(showError);

      const promise = AdService.showRewardedAd();
      mockAd.emit('rewarded_loaded');
      await expect(promise).rejects.toThrow('show failed');
    });

    it('cleans up both listeners when load fails', async () => {
      const mockAd = makeMockRewardedAd();
      const { RewardedAd } = jest.requireMock('react-native-google-mobile-ads');
      (RewardedAd.createForAdRequest as jest.Mock).mockReturnValue(mockAd);

      const promise = AdService.showRewardedAd();
      mockAd.emit('error', new Error('fail'));
      await promise.catch(() => {});

      expect(mockAd.listenerCount('rewarded_loaded')).toBe(0);
      expect(mockAd.listenerCount('error')).toBe(0);
    });

    it('rejects when user dismisses ad without earning reward', async () => {
      const mockAd = makeMockRewardedAd();
      const { RewardedAd } = jest.requireMock('react-native-google-mobile-ads');
      (RewardedAd.createForAdRequest as jest.Mock).mockReturnValue(mockAd);
      (StorageService.storeData as jest.Mock).mockResolvedValue(undefined);

      const promise = AdService.showRewardedAd();
      mockAd.emit('rewarded_loaded');
      await Promise.resolve();
      mockAd.emit('closed');

      await expect(promise).rejects.toThrow('ad closed without reward');
      expect(StorageService.storeData).not.toHaveBeenCalled();
      expect(mockAd.listenerCount('rewarded_earned_reward')).toBe(0);
      expect(mockAd.listenerCount('error')).toBe(0);
      expect(mockAd.listenerCount('closed')).toBe(0);
    });
  });
});
