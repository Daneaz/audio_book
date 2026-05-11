import { Platform } from 'react-native';
import * as Speech from 'expo-speech';
import { TtsOptions, TtsProvider } from './TtsProvider';
import { splitIntoSubClauses } from '../../utils/textUtils';

export class LocalTtsProvider implements TtsProvider {
  private _stopped = false;

  constructor(private readonly voiceIdentifier: string | undefined) {}

  speak(text: string, options: TtsOptions = {}): void {
    this._stopped = false;
    const subclauses = splitIntoSubClauses(text);
    this._playSubclause(subclauses, 0, options);
  }

  private _playSubclause(subclauses: string[], idx: number, options: TtsOptions): void {
    if (this._stopped) return;
    if (idx >= subclauses.length) {
      setTimeout(() => { if (!this._stopped) options.onDone?.(); }, 50);
      return;
    }
    Speech.speak(subclauses[idx], {
      language: options.language ?? 'zh-CN',
      rate: options.rate,
      voice: this.voiceIdentifier,
      onDone: () => {
        if (this._stopped) return;
        if (idx < subclauses.length - 1) {
          setTimeout(() => { if (!this._stopped) this._playSubclause(subclauses, idx + 1, options); }, 150);
        } else {
          setTimeout(() => { if (!this._stopped) options.onDone?.(); }, 50);
        }
      },
      onStopped: () => options.onStopped?.(),
      onError: (e) => options.onError?.(e as unknown as Error),
    });
  }

  async prefetch(_text: string): Promise<void> {}

  async stop(): Promise<void> {
    this._stopped = true;
    await Speech.stop();
  }
}
