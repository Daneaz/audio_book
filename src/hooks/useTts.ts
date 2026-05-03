import { useRef } from 'react';
import { LocalTtsProvider } from '../services/tts/LocalTtsProvider';
import { XfyunTtsProvider } from '../services/tts/XfyunTtsProvider';
import { TtsOptions, TtsProvider } from '../services/tts/TtsProvider';

function createProvider(voiceType: string): TtsProvider {
  if (voiceType.startsWith('xfyun:')) {
    return new XfyunTtsProvider(voiceType.split(':')[1]);
  }
  return new LocalTtsProvider(voiceType === 'default' ? undefined : voiceType);
}

export default function useTts(voiceType: string) {
  const providerRef = useRef<TtsProvider | null>(null);
  const voiceTypeRef = useRef<string | null>(null);

  if (voiceTypeRef.current !== voiceType) {
    providerRef.current?.stop().catch(() => {});
    providerRef.current = createProvider(voiceType);
    voiceTypeRef.current = voiceType;
  }

  const speak = (text: string, options: TtsOptions = {}) => {
    providerRef.current!.speak(text, options);
  };

  const prefetch = (text: string) => {
    providerRef.current!.prefetch(text);
  };

  const stop = async () => {
    await providerRef.current?.stop();
  };

  return { speak, stop, prefetch };
}
