import * as FileSystem from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { Audio } from 'expo-av';
import { TtsOptions, TtsProvider } from './TtsProvider';
import { LocalTtsProvider } from './LocalTtsProvider';
import { XFYUN_KEYS } from '../../utils/constants';

const isMock = XFYUN_KEYS.APP_ID === 'MOCK_APPID';

export class XfyunTtsProvider implements TtsProvider {
  private readonly voiceId: string;
  private readonly fallback: LocalTtsProvider;
  private currentSound: Audio.Sound | null = null;

  constructor(voiceId: string) {
    this.voiceId = voiceId;
    this.fallback = new LocalTtsProvider(undefined);
  }

  speak(text: string, options: TtsOptions = {}): void {
    this._speakAsync(text, options).catch(e => {
      console.warn('XfyunTtsProvider: falling back to local TTS:', e.message);
      this.fallback.speak(text, options);
    });
  }

  private async _speakAsync(text: string, options: TtsOptions): Promise<void> {
    await this.stop();
    const cachePath = await this._getCachePath(text);
    const info = await FileSystem.getInfoAsync(cachePath);
    if (!info.exists) {
      await this._synthesizeAndCache(text, cachePath);
    }
    await this._playFile(cachePath, options);
  }

  private async _synthesizeAndCache(_text: string, _cachePath: string): Promise<void> {
    if (isMock) {
      throw new Error('iFlyTek credentials not configured — using local TTS');
    }
    throw new Error('iFlyTek synthesis not yet implemented');
  }

  private async _playFile(path: string, options: TtsOptions): Promise<void> {
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false });
    const { sound } = await Audio.Sound.createAsync({ uri: path });
    this.currentSound = sound;
    try {
      if (options.rate && options.rate !== 1.0) {
        await sound.setRateAsync(options.rate, true);
      }
      sound.setOnPlaybackStatusUpdate(status => {
        if (status.isLoaded && status.didJustFinish && !status.isPlaying) {
          sound.unloadAsync().catch(() => {});
          this.currentSound = null;
          options.onDone?.();
        }
      });
      await sound.playAsync();
    } catch (e) {
      await sound.unloadAsync().catch(() => {});
      this.currentSound = null;
      throw e;
    }
  }

  async prefetch(text: string): Promise<void> {
    if (isMock) return;
    await this._prefetchAsync(text).catch(() => {});
  }

  private async _prefetchAsync(text: string): Promise<void> {
    const cachePath = await this._getCachePath(text);
    const info = await FileSystem.getInfoAsync(cachePath);
    if (!info.exists) {
      await this._synthesizeAndCache(text, cachePath);
    }
  }

  async stop(): Promise<void> {
    if (this.currentSound) {
      await this.currentSound.stopAsync().catch(() => {});
      await this.currentSound.unloadAsync().catch(() => {});
      this.currentSound = null;
    }
  }

  private async _getCachePath(text: string): Promise<string> {
    const hash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.MD5,
      this.voiceId + text
    );
    const dir = `${FileSystem.cacheDirectory}xfyun_tts/${this.voiceId}/`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    return `${dir}${hash}.mp3`;
  }
}
