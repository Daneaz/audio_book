import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { TtsOptions, TtsProvider } from './TtsProvider';
import { LocalTtsProvider } from './LocalTtsProvider';
import { XFYUN_PROXY } from '../../utils/constants';
import { isXfyunVoice } from '../../utils/voiceUtils';
import AdService from '../../services/AdService';

const isProxyConfigured = XFYUN_PROXY.URL.length > 0;

// ----------------------------------------------------------------

export class XfyunTtsProvider implements TtsProvider {
  private readonly voiceId: string;
  private readonly fallback: LocalTtsProvider;
  private currentSound: AudioPlayer | null = null;
  private _gen = 0;

  constructor(voiceId: string, backupVoiceId: string = 'default') {
    this.voiceId = voiceId;
    const localId = (isXfyunVoice(backupVoiceId) || backupVoiceId === 'default' || backupVoiceId === '')
      ? undefined
      : backupVoiceId;
    this.fallback = new LocalTtsProvider(localId);
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
    if (this.currentSound) {
      try { this.currentSound.pause(); } catch {}
      this.currentSound.remove();
      this.currentSound = null;
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
    await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true });
    const player = createAudioPlayer({ uri: path });
    this.currentSound = player;
    if (options.rate && options.rate !== 1.0) {
      player.setPlaybackRate(options.rate);
    }
    player.addListener('playbackStatusUpdate', status => {
      if (status.didJustFinish) {
        player.remove();
        if (this.currentSound === player) this.currentSound = null;
        options.onDone?.();
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
