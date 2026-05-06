import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { useCloudVoiceAccess } from '../src/hooks/useCloudVoiceAccess';
import AdService from '../src/services/AdService';

jest.mock('../src/services/AdService', () => ({
  __esModule: true,
  default: {
    isCloudVoiceUnlocked: jest.fn(),
    showRewardedAd: jest.fn(),
    unlockCloudVoice: jest.fn(),
  },
}));

jest.mock('../src/hooks/useMembership', () => ({
  __esModule: true,
  default: () => ({ isActive: false }),
}));

jest.mock('../src/i18n', () => ({
  __esModule: true,
  default: () => ({ t: (key: string) => key }),
}));

jest.mock('../src/utils/voiceUtils', () => ({
  isXfyunVoice: (id: string) =>
    ['x4_yezi', 'x4_xiaoyan', 'xiaoyu', 'aisjiuxu', 'aisxping', 'aisjinger', 'aisbabyxu', 'x4_xiaoxi', 'x4_lingbosong'].includes(id),
}));

describe('useCloudVoiceAccess', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls onGranted immediately for non-cloud voices', async () => {
    const { result } = renderHook(() => useCloudVoiceAccess());
    const onGranted = jest.fn();

    await act(async () => {
      result.current.requestAccess('com.apple.voice.premium.zh-CN.Lili', 'zh-CN', { onGranted });
    });

    expect(onGranted).toHaveBeenCalledWith('com.apple.voice.premium.zh-CN.Lili', 'zh-CN');
    expect(AdService.isCloudVoiceUnlocked).not.toHaveBeenCalled();
  });

  it('calls onGranted immediately for cloud voice when already unlocked', async () => {
    (AdService.isCloudVoiceUnlocked as jest.Mock).mockResolvedValue(true);
    const { result } = renderHook(() => useCloudVoiceAccess());
    const onGranted = jest.fn();

    await act(async () => {
      result.current.requestAccess('x4_yezi', 'zh-CN', { onGranted });
    });

    expect(onGranted).toHaveBeenCalledWith('x4_yezi', 'zh-CN');
  });

  it('shows Alert when cloud voice is locked', async () => {
    (AdService.isCloudVoiceUnlocked as jest.Mock).mockResolvedValue(false);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { result } = renderHook(() => useCloudVoiceAccess());

    await act(async () => {
      result.current.requestAccess('x4_yezi', 'zh-CN', { onGranted: jest.fn() });
    });

    expect(alertSpy).toHaveBeenCalled();
  });

  it('calls onBeforeAd, unlocks, and calls onGranted after successful ad', async () => {
    (AdService.isCloudVoiceUnlocked as jest.Mock).mockResolvedValue(false);
    (AdService.showRewardedAd as jest.Mock).mockResolvedValue(undefined);
    (AdService.unlockCloudVoice as jest.Mock).mockResolvedValue(undefined);

    let alertButtons: any[] = [];
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      alertButtons = buttons ?? [];
    });

    const { result } = renderHook(() => useCloudVoiceAccess());
    const onGranted = jest.fn();
    const onBeforeAd = jest.fn();

    await act(async () => {
      result.current.requestAccess('x4_yezi', 'zh-CN', { onGranted, onBeforeAd });
    });

    await act(async () => {
      await alertButtons[1].onPress();
    });

    expect(onBeforeAd).toHaveBeenCalled();
    expect(AdService.showRewardedAd).toHaveBeenCalled();
    expect(AdService.unlockCloudVoice).toHaveBeenCalled();
    expect(onGranted).toHaveBeenCalledWith('x4_yezi', 'zh-CN');
  });

  it('does not call onGranted when ad is dismissed without reward', async () => {
    (AdService.isCloudVoiceUnlocked as jest.Mock).mockResolvedValue(false);
    (AdService.showRewardedAd as jest.Mock).mockRejectedValue(new Error('ad closed without reward'));

    let alertButtons: any[] = [];
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      alertButtons = buttons ?? [];
    });

    const { result } = renderHook(() => useCloudVoiceAccess());
    const onGranted = jest.fn();

    await act(async () => {
      result.current.requestAccess('x4_yezi', 'zh-CN', { onGranted });
    });

    await act(async () => {
      await alertButtons[1].onPress();
    });

    expect(AdService.unlockCloudVoice).not.toHaveBeenCalled();
    expect(onGranted).not.toHaveBeenCalled();
  });

  it('does not show ad or call onGranted when user taps cancel', async () => {
    (AdService.isCloudVoiceUnlocked as jest.Mock).mockResolvedValue(false);
    let alertButtons: any[] = [];
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, btns) => {
      alertButtons = btns ?? [];
    });
    const { result } = renderHook(() => useCloudVoiceAccess());
    const onGranted = jest.fn();

    await act(async () => {
      result.current.requestAccess('x4_yezi', 'zh-CN', { onGranted });
    });

    expect(alertButtons[0].style).toBe('cancel');
    expect(AdService.showRewardedAd).not.toHaveBeenCalled();
    expect(onGranted).not.toHaveBeenCalled();
  });
});
