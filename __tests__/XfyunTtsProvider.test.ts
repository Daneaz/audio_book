import { XfyunTtsProvider } from '../src/services/tts/XfyunTtsProvider';

const mockLocalSpeak = jest.fn();
const mockLocalStop = jest.fn().mockResolvedValue(undefined);

jest.mock('../src/services/tts/LocalTtsProvider', () => ({
  LocalTtsProvider: jest.fn().mockImplementation(() => ({
    speak: mockLocalSpeak,
    stop: mockLocalStop,
    prefetch: jest.fn(),
  })),
}));

jest.mock('expo-av', () => ({
  Audio: {
    Sound: { createAsync: jest.fn() },
    setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn().mockReturnValue({
    pause: jest.fn(),
    remove: jest.fn(),
    setPlaybackRate: jest.fn(),
    addListener: jest.fn(),
    play: jest.fn(),
  }),
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-file-system', () => ({
  cacheDirectory: 'file://cache/',
  getInfoAsync: jest.fn().mockResolvedValue({ exists: false }),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file://cache/',
  getInfoAsync: jest.fn().mockResolvedValue({ exists: false }),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  EncodingType: { Base64: 'base64' },
}));

jest.mock('expo-crypto', () => ({
  digestStringAsync: jest.fn().mockResolvedValue('abc123hash'),
  CryptoDigestAlgorithm: { MD5: 'MD5' },
}));

jest.mock('../src/utils/constants', () => ({
  XFYUN_KEYS: { APP_ID: 'MOCK_APPID', API_KEY: 'MOCK_API_KEY', API_SECRET: 'MOCK_API_SECRET' },
}));

jest.mock('../src/services/AdService', () => ({
  __esModule: true,
  default: {
    isCloudVoiceUnlocked: jest.fn().mockResolvedValue(true),
  },
}));

describe('XfyunTtsProvider', () => {
  beforeEach(() => jest.clearAllMocks());

  it('falls back to LocalTtsProvider when in mock mode (no real credentials)', async () => {
    const provider = new XfyunTtsProvider('xiaoyan');
    const onDone = jest.fn();
    provider.speak('你好', { onDone });

    await new Promise(r => setTimeout(r, 20));

    expect(mockLocalSpeak).toHaveBeenCalledWith(
      '你好',
      expect.objectContaining({ onDone })
    );
  });

  it('prefetch is silent no-op in mock mode', async () => {
    const provider = new XfyunTtsProvider('xiaoyan');
    await provider.prefetch('你好');
    expect(require('expo-av').Audio.Sound.createAsync).not.toHaveBeenCalled();
  });

  it('stop resolves without error when no sound is playing', async () => {
    const provider = new XfyunTtsProvider('xiaoyan');
    await expect(provider.stop()).resolves.toBeUndefined();
  });

  describe('cloud voice access gate', () => {
    it('falls back to local TTS and skips cache when access is denied', async () => {
      const AdService = jest.requireMock('../src/services/AdService');
      (AdService.default.isCloudVoiceUnlocked as jest.Mock).mockResolvedValue(false);

      const { getInfoAsync } = jest.requireMock('expo-file-system/legacy');
      getInfoAsync.mockClear();

      const provider = new XfyunTtsProvider('x4_yezi');
      const onDone = jest.fn();
      provider.speak('你好', { onDone });

      await new Promise(r => setTimeout(r, 30));

      expect(getInfoAsync).not.toHaveBeenCalled();
      expect(mockLocalSpeak).toHaveBeenCalledWith('你好', expect.objectContaining({ onDone }));
    });

    it('proceeds to cache lookup when access is granted', async () => {
      const AdService = jest.requireMock('../src/services/AdService');
      (AdService.default.isCloudVoiceUnlocked as jest.Mock).mockResolvedValue(true);

      const { getInfoAsync } = jest.requireMock('expo-file-system/legacy');
      getInfoAsync.mockClear();

      const provider = new XfyunTtsProvider('x4_yezi');
      provider.speak('你好', {});

      await new Promise(r => setTimeout(r, 30));

      expect(getInfoAsync).toHaveBeenCalled();
    });
  });
});
