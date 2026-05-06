import { useCallback } from 'react';
import { Alert } from 'react-native';
import AdService from '../services/AdService';
import useMembership from './useMembership';
import useI18n from '../i18n';
import { isXfyunVoice } from '../utils/voiceUtils';

interface RequestAccessOpts {
  onGranted: (id: string, lang: string) => void;
  onBeforeAd?: () => void;
}

export function useCloudVoiceAccess() {
  const { isActive } = useMembership();
  const { t } = useI18n();

  const requestAccess = useCallback((voiceId: string, lang: string, opts: RequestAccessOpts) => {
    if (!isXfyunVoice(voiceId)) {
      opts.onGranted(voiceId, lang);
      return;
    }

    if (isActive) {
      opts.onGranted(voiceId, lang);
      return;
    }

    AdService.isCloudVoiceUnlocked().then(unlocked => {
      if (unlocked) {
        opts.onGranted(voiceId, lang);
        return;
      }

      Alert.alert(
        t('voice.cloudAdTitle'),
        t('voice.cloudAdMessage'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('voice.cloudAdConfirm'),
            onPress: async () => {
              opts.onBeforeAd?.();
              try {
                await AdService.showRewardedAd();
                await AdService.unlockCloudVoice();
                opts.onGranted(voiceId, lang);
              } catch {
                // 用户未看完广告，静默失败
              }
            },
          },
        ]
      );
    });
  }, [isActive, t]);

  return { requestAccess };
}
