export interface TtsOptions {
  rate?: number;
  language?: string;
  onStart?: () => void;
  onDone?: () => void;
  onStopped?: () => void;
  onError?: (e: Error) => void;
  onFallback?: () => void;
}

export interface TtsProvider {
  speak(text: string, options: TtsOptions): void;
  prefetch(text: string): Promise<void>;
  stop(): Promise<void>;
}
