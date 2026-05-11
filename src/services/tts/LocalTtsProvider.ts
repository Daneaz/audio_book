import * as Speech from 'expo-speech';
import { TtsOptions, TtsProvider } from './TtsProvider';

export class LocalTtsProvider implements TtsProvider {
  private _stopped = false;

  constructor(private readonly voiceIdentifier: string | undefined) {}

  speak(text: string, options: TtsOptions = {}): void {
    this._stopped = false;
    Speech.speak(text, {
      language: options.language ?? 'zh-CN',
      rate: options.rate,
      voice: this.voiceIdentifier,
      onStart: () => {
        if (this._stopped) return;
        options.onStart?.();
      },
      onDone: () => {
        if (this._stopped) return;
        options.onDone?.();
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
