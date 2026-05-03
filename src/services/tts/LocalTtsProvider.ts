import { Platform } from 'react-native';
import * as Speech from 'expo-speech';
import { TtsOptions, TtsProvider } from './TtsProvider';
import { splitIntoSubClauses } from '../../utils/textUtils';

export class LocalTtsProvider implements TtsProvider {
  constructor(private readonly voiceIdentifier: string | undefined) {}

  speak(text: string, options: TtsOptions = {}): void {
    const subclauses = splitIntoSubClauses(text);
    this._playSubclause(subclauses, 0, options);
  }

  private _playSubclause(subclauses: string[], idx: number, options: TtsOptions): void {
    if (idx >= subclauses.length) {
      setTimeout(() => options.onDone?.(), 50);
      return;
    }
    Speech.speak(subclauses[idx], {
      language: options.language ?? 'zh-CN',
      rate: options.rate,
      voice: this.voiceIdentifier,
      ...(Platform.OS === 'ios' && { useApplicationAudioSession: false }),
      onDone: () => {
        if (idx < subclauses.length - 1) {
          setTimeout(() => this._playSubclause(subclauses, idx + 1, options), 150);
        } else {
          setTimeout(() => options.onDone?.(), 50);
        }
      },
      onStopped: () => options.onStopped?.(),
      onError: (e) => options.onError?.(e as unknown as Error),
    });
  }

  async prefetch(_text: string): Promise<void> {}

  async stop(): Promise<void> {
    await Speech.stop();
  }
}
