import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { AudioPlayer, createAudioPlayer, setAudioModeAsync, setIsAudioActiveAsync } from 'expo-audio';
import { Platform } from 'react-native';
import { TtsOptions, TtsProvider } from './TtsProvider';
import { LocalTtsProvider } from './LocalTtsProvider';
import { XFYUN_PROXY } from '../../utils/constants';
import { isXfyunVoice } from '../../utils/voiceUtils';
import AdService from '../../services/AdService';

const isProxyConfigured = XFYUN_PROXY.URL.length > 0;
const WATCHDOG_GRACE_MS = 1500;

// ----------------------------------------------------------------

export class XfyunTtsProvider implements TtsProvider {
  private readonly voiceId: string;
  private readonly fallback: LocalTtsProvider;
  private currentSound: AudioPlayer | null = null;
  private currentWatchdog: ReturnType<typeof setTimeout> | null = null;
  private _gen = 0;

  constructor(voiceId: string, backupVoiceId: string = 'default') {
    this.voiceId = voiceId;
    const localId = (isXfyunVoice(backupVoiceId) || backupVoiceId === 'default' || backupVoiceId === '')
      ? undefined
      : backupVoiceId;
    this.fallback = new LocalTtsProvider(localId);
    // Set background playback mode once at init time, before ExpoNowPlayingModule activates
    // the session. This lets ExpoNowPlayingModule's .spokenAudio mode win at play time.
    if (Platform.OS === 'ios') {
      setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true }).catch(() => {});
    }
  }

  speak(text: string, options: TtsOptions = {}): void {
    const gen = ++this._gen;
    this._speakAsync(text, options, gen).catch(e => {
      if (this._gen !== gen) return;
      if (e.message !== 'cloud voice access expired') {
        console.warn('XfyunTtsProvider: falling back to local TTS:', e.message);
      }
      options.onFallback?.();
      this.fallback.speak(text, options);
    });
  }

  private async _speakAsync(text: string, options: TtsOptions, gen: number): Promise<void> {
    await this._stopCurrentPlayer();
    if (this._gen !== gen) return;
    const hasAccess = await AdService.isCloudVoiceUnlocked();
    if (!hasAccess) {
      throw new Error('cloud voice access expired');
    }
    const cachePath = await this._getCachePath(text);
    const info = await FileSystem.getInfoAsync(cachePath);
    if (!info.exists) {
      await this._synthesizeAndCache(text, cachePath);
    }
    if (this._gen !== gen) return;
    await this._playFile(cachePath, options);
  }

  private async _stopCurrentPlayer(): Promise<void> {
    await this.fallback.stop();
    this._cancelWatchdog();
    if (this.currentSound) {
      try { this.currentSound.pause(); } catch {}
      this.currentSound.remove();
      this.currentSound = null;
    }
  }

  private _cancelWatchdog(): void {
    if (this.currentWatchdog) {
      clearTimeout(this.currentWatchdog);
      this.currentWatchdog = null;
    }
  }

  private async _synthesizeAndCache(text: string, cachePath: string): Promise<void> {
    if (!isProxyConfigured) {
      throw new Error('iFlyTek proxy not configured — using local TTS');
    }

    const response = await fetch(`${XFYUN_PROXY.URL.replace(/\/+$/, '')}/tts`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(XFYUN_PROXY.TOKEN ? { 'x-app-token': XFYUN_PROXY.TOKEN } : {}),
      },
      body: JSON.stringify({
        text,
        voiceId: this.voiceId,
        speed: 50,
      }),
    });

    if (!response.ok) {
      throw new Error(`iFlyTek proxy error ${response.status}`);
    }

    const result = await response.json();
    if (!result?.audioBase64 || typeof result.audioBase64 !== 'string') {
      throw new Error('iFlyTek proxy returned invalid audio');
    }

    await FileSystem.writeAsStringAsync(cachePath, result.audioBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }

  private async _playFile(path: string, options: TtsOptions): Promise<void> {
    if (Platform.OS !== 'ios') {
      // Re-enable audio focus after stop(); iOS session is managed by ExpoNowPlayingModule.
      try { await setIsAudioActiveAsync(true); } catch {}
    }

    const info = await FileSystem.getInfoAsync(path, { size: true } as any);
    if (!info.exists || (info as any).size === 0) {
      try { await FileSystem.deleteAsync(path, { idempotent: true }); } catch {}
      throw new Error('cached audio file missing or empty');
    }

    const player = createAudioPlayer(
      { uri: path },
      Platform.OS === 'ios' ? { keepAudioSessionActive: true } : {},
    );
    this.currentSound = player;
    if (options.rate && options.rate !== 1.0) {
      player.setPlaybackRate(options.rate);
    }
    let watchdogScheduled = false;
    const finish = () => {
      if (this.currentSound !== player) return;
      this._cancelWatchdog();
      try { player.remove(); } catch {}
      if (this.currentSound === player) this.currentSound = null;
      options.onDone?.();
    };
    player.addListener('playbackStatusUpdate', status => {
      if (this.currentSound !== player) return;
      if (!watchdogScheduled && status.isLoaded && status.duration > 0) {
        watchdogScheduled = true;
        const rate = options.rate && options.rate > 0 ? options.rate : 1.0;
        const expectedMs = (status.duration / rate) * 1000 + WATCHDOG_GRACE_MS;
        this._cancelWatchdog();
        this.currentWatchdog = setTimeout(() => {
          if (this.currentSound !== player) return;
          console.warn('[XfyunTts] watchdog: didJustFinish missing, forcing onDone');
          finish();
        }, expectedMs);
      }
      if (status.didJustFinish) {
        finish();
      }
    });
    player.play();
  }

  async prefetch(text: string): Promise<void> {
    if (!isProxyConfigured) return;
    await this._prefetchAsync(text).catch(() => {});
  }

  private async _prefetchAsync(text: string): Promise<void> {
    const hasAccess = await AdService.isCloudVoiceUnlocked();
    if (!hasAccess) return;
    const cachePath = await this._getCachePath(text);
    const info = await FileSystem.getInfoAsync(cachePath);
    if (!info.exists) {
      await this._synthesizeAndCache(text, cachePath);
    }
  }

  async stop(): Promise<void> {
    this._gen++;
    await this._stopCurrentPlayer();
    // Do NOT call setIsAudioActiveAsync(false): on iOS it drops the lock screen media player
    // (session must stay active while paused); on Android it permanently blocks play().
    // Full deactivation is handled by nowPlaying.reset() in ExpoNowPlayingModule.
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
