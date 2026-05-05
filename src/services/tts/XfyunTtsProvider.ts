import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { TtsOptions, TtsProvider } from './TtsProvider';
import { LocalTtsProvider } from './LocalTtsProvider';
import { XFYUN_KEYS } from '../../utils/constants';

const isMock = XFYUN_KEYS.APP_ID === 'MOCK_APPID';

function _uint8ToBase64(bytes: Uint8Array): string {
  return btoa(Array.from(bytes).map(b => String.fromCharCode(b)).join(''));
}

// ----------------------------------------------------------------

export class XfyunTtsProvider implements TtsProvider {
  private readonly voiceId: string;
  private readonly fallback: LocalTtsProvider;
  private currentSound: AudioPlayer | null = null;
  private _gen = 0;

  constructor(voiceId: string) {
    this.voiceId = voiceId;
    this.fallback = new LocalTtsProvider(undefined);
  }

  speak(text: string, options: TtsOptions = {}): void {
    const gen = ++this._gen;
    this._speakAsync(text, options, gen).catch(e => {
      if (this._gen !== gen) return;
      console.warn('XfyunTtsProvider: falling back to local TTS:', e.message);
      this.fallback.speak(text, options);
    });
  }

  private async _speakAsync(text: string, options: TtsOptions, gen: number): Promise<void> {
    await this._stopCurrentPlayer();
    if (this._gen !== gen) return;
    const cachePath = await this._getCachePath(text);
    const info = await FileSystem.getInfoAsync(cachePath);
    if (!info.exists) {
      await this._synthesizeAndCache(text, cachePath, options.rate ?? 1.0);
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

  private _buildWsUrl(): string {
    const host = 'tts-api.xfyun.cn';
    const path = '/v2/tts';
    const date = new Date().toUTCString();
    const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`;

    const enc = new TextEncoder();
    const sig = _uint8ToBase64(hmac(sha256, enc.encode(XFYUN_KEYS.API_SECRET), enc.encode(signatureOrigin)));
    const authorization = btoa(
      `api_key="${XFYUN_KEYS.API_KEY}", algorithm="hmac-sha256", headers="host date request-line", signature="${sig}"`,
    );

    return `wss://${host}${path}?authorization=${encodeURIComponent(authorization)}&date=${encodeURIComponent(date)}&host=${host}`;
  }

  private async _synthesizeAndCache(text: string, cachePath: string, rate: number): Promise<void> {
    if (isMock) {
      throw new Error('iFlyTek credentials not configured — using local TTS');
    }

    const wsUrl = this._buildWsUrl();
    const chunks: string[] = [];

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      let settled = false;
      const settle = (fn: () => void) => { if (!settled) { settled = true; fn(); } };

      ws.onopen = () => {
        const bytes = new TextEncoder().encode(text);
        const binary = Array.from(bytes).map(b => String.fromCharCode(b)).join('');
        ws.send(JSON.stringify({
          common: { app_id: XFYUN_KEYS.APP_ID },
          business: {
            aue: 'lame',
            auf: 'audio/L16;rate=16000',
            vcn: this.voiceId,
            speed: Math.min(100, Math.max(0, Math.round((rate / 2) * 100))),
            volume: 50,
            pitch: 50,
            bgs: 0,
            tte: 'UTF8',
          },
          data: { status: 2, text: btoa(binary) },
        }));
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const resp = JSON.parse(event.data as string);
          if (resp.code !== 0) {
            ws.close();
            settle(() => reject(new Error(`iFlyTek error ${resp.code}: ${resp.message}`)));
            return;
          }
          if (resp.data?.audio) chunks.push(resp.data.audio);
          if (resp.data?.status === 2) {
            ws.close();
            settle(() => resolve());
          }
        } catch (e) {
          ws.close();
          settle(() => reject(e));
        }
      };

      ws.onerror = (e: Event) => {
        console.warn('XfyunTtsProvider WS onerror', e);
        settle(() => reject(new Error('iFlyTek WebSocket error')));
      };
      ws.onclose = (e: CloseEvent) => {
        if (e.code !== 1000) {
          console.warn('XfyunTtsProvider WS onclose', e.code, e.reason);
          settle(() => reject(new Error(`WebSocket closed: ${e.code} ${e.reason}`)));
        }
      };
    });

    await FileSystem.writeAsStringAsync(cachePath, chunks.join(''), {
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
    if (isMock) return;
    await this._prefetchAsync(text).catch(() => {});
  }

  private async _prefetchAsync(text: string): Promise<void> {
    const cachePath = await this._getCachePath(text);
    const info = await FileSystem.getInfoAsync(cachePath);
    if (!info.exists) {
      await this._synthesizeAndCache(text, cachePath, 1.0);
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
