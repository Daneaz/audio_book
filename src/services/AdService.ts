import { AdEventType, RewardedAd, RewardedAdEventType, TestIds } from 'react-native-google-mobile-ads';
import StorageService from './StorageService';
import MembershipService from './MembershipService';
import { AD_UNIT_IDS, STORAGE_KEYS } from '../utils/constants';

const BANNER_HIDDEN_DURATION_MS = 60 * 60 * 1000;
const CLOUD_VOICE_UNLOCK_DURATION_MS = 30 * 60 * 1000;

export interface AdState {
  bannerHiddenUntil: string | null;
  cloudVoiceUnlockedUntil: string | null;
}

class AdService {
  async shouldShowBanner(): Promise<boolean> {
    const isMember = await MembershipService.isActive();
    if (isMember) return false;

    const state: AdState | null = await StorageService.getData(STORAGE_KEYS.AD_STATE);
    if (state?.bannerHiddenUntil && new Date(state.bannerHiddenUntil) > new Date()) {
      return false;
    }
    return true;
  }

  async hideBannerForOneHour(): Promise<void> {
    const state = (await StorageService.getData(STORAGE_KEYS.AD_STATE)) ?? {};
    const until = new Date(Date.now() + BANNER_HIDDEN_DURATION_MS).toISOString();
    await StorageService.storeData(STORAGE_KEYS.AD_STATE, { ...state, bannerHiddenUntil: until });
  }

  async isCloudVoiceUnlocked(): Promise<boolean> {
    const isMember = await MembershipService.isActive();
    if (isMember) return true;
    const state: AdState | null = await StorageService.getData(STORAGE_KEYS.AD_STATE);
    if (state?.cloudVoiceUnlockedUntil && new Date(state.cloudVoiceUnlockedUntil) > new Date()) {
      return true;
    }
    return false;
  }

  async unlockCloudVoice(): Promise<void> {
    const state = (await StorageService.getData(STORAGE_KEYS.AD_STATE)) ?? {};
    const until = new Date(Date.now() + CLOUD_VOICE_UNLOCK_DURATION_MS).toISOString();
    await StorageService.storeData(STORAGE_KEYS.AD_STATE, { ...state, cloudVoiceUnlockedUntil: until });
  }

  async showRewardedAd(): Promise<void> {
    const rewardedAd = RewardedAd.createForAdRequest(AD_UNIT_IDS.REWARDED, {
      requestNonPersonalizedAdsOnly: true,
    });

    await new Promise<void>((resolve, reject) => {
      let unsubLoad: () => void;
      let unsubError: () => void;
      const cleanup = () => { unsubLoad?.(); unsubError?.(); };

      unsubLoad = rewardedAd.addAdEventListener(RewardedAdEventType.LOADED, () => {
        cleanup();
        resolve();
      });
      unsubError = rewardedAd.addAdEventListener(AdEventType.ERROR, (error: Error) => {
        cleanup();
        reject(error);
      });
      rewardedAd.load();
    });

    await new Promise<void>((resolve, reject) => {
      let unsubEarned: () => void;
      let unsubError: () => void;
      let unsubClosed: () => void;
      const cleanup = () => { unsubEarned?.(); unsubError?.(); unsubClosed?.(); };

      unsubEarned = rewardedAd.addAdEventListener(
        RewardedAdEventType.EARNED_REWARD,
        async () => {
          cleanup();
          await this.hideBannerForOneHour();
          resolve();
        }
      );
      unsubError = rewardedAd.addAdEventListener(AdEventType.ERROR, (error: Error) => {
        cleanup();
        reject(error);
      });
      unsubClosed = rewardedAd.addAdEventListener(AdEventType.CLOSED, () => {
        cleanup();
        reject(new Error('ad closed without reward'));
      });
      rewardedAd.show().catch(reject);
    });
  }
}

export default new AdService();
