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
  setIsAudioActiveAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file://cache/',
  getInfoAsync: jest.fn().mockResolvedValue({ exists: false }),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  EncodingType: { Base64: 'base64' },
}));

jest.mock('expo-crypto', () => ({
  digestStringAsync: jest.fn().mockResolvedValue('abc123hash'),
  CryptoDigestAlgorithm: { MD5: 'MD5' },
}));

jest.mock('../src/utils/constants', () => ({
  XFYUN_PROXY: { URL: '', TOKEN: '' },
}));

jest.mock('../src/services/AdService', () => ({
  __esModule: true,
  default: {
    isCloudVoiceUnlocked: jest.fn().mockResolvedValue(true),
  },
}));

describe('XfyunTtsProvider', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

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

    it('prefetch silently skips when access is denied', async () => {
      const AdService = jest.requireMock('../src/services/AdService');
      (AdService.default.isCloudVoiceUnlocked as jest.Mock).mockResolvedValue(false);

      const { getInfoAsync } = jest.requireMock('expo-file-system/legacy');
      getInfoAsync.mockClear();

      const provider = new XfyunTtsProvider('x4_yezi');
      await provider.prefetch('你好');

      expect(getInfoAsync).not.toHaveBeenCalled();
    });
  });

  describe('Cloudflare proxy mode', () => {
    beforeEach(() => {
      jest.resetModules();
    });

    afterEach(() => {
      jest.dontMock('../src/utils/constants');
    });

    it('posts synthesis requests to the proxy and writes returned audio to cache', async () => {
      jest.doMock('../src/utils/constants', () => ({
        XFYUN_PROXY: {
          URL: 'https://tts.example.workers.dev',
          TOKEN: 'app-token',
        },
      }));

      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ audioBase64: 'BASE64_MP3' }),
      });
      global.fetch = fetchMock as any;

      const { XfyunTtsProvider: ProxyProvider } = require('../src/services/tts/XfyunTtsProvider');
      const FileSystem = require('expo-file-system/legacy');
      FileSystem.getInfoAsync.mockResolvedValue({ exists: false });

      const provider = new ProxyProvider('x4_yezi');
      provider.speak('你好', {});

      await new Promise(r => setTimeout(r, 30));

      expect(fetchMock).toHaveBeenCalledWith(
        'https://tts.example.workers.dev/tts',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'content-type': 'application/json',
            'x-app-token': 'app-token',
          }),
          body: JSON.stringify({ text: '你好', voiceId: 'x4_yezi', speed: 50 }),
        })
      );
      expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
        'file://cache/xfyun_tts/x4_yezi/abc123hash.mp3',
        'BASE64_MP3',
        { encoding: 'base64' }
      );
    });
  });
});
