import { useEffect, useMemo, useRef } from 'react';
import { LocalTtsProvider } from '../services/tts/LocalTtsProvider';
import { XfyunTtsProvider } from '../services/tts/XfyunTtsProvider';
import { TtsOptions, TtsProvider } from '../services/tts/TtsProvider';

function createProvider(voiceType: string): TtsProvider {
  if (voiceType.startsWith('xfyun:')) {
    return new XfyunTtsProvider(voiceType.split(':')[1]);
  }
  const id = voiceType === 'default' || voiceType === '' ? undefined : voiceType;
  return new LocalTtsProvider(id);
}

export default function useTts(voiceType: string) {
  const provider = useMemo(() => createProvider(voiceType), [voiceType]);
  const providerRef = useRef<TtsProvider>(provider);

  useEffect(() => {
    const prev = providerRef.current;
    if (prev !== provider) {
      prev.stop().catch(() => {});
      providerRef.current = provider;
    }
  }, [provider]);

  const speak = (text: string, options: TtsOptions = {}) => {
    provider.speak(text, options);
  };

  const prefetch = (text: string) => {
    provider.prefetch(text);
  };

  const stop = async () => {
    await provider.stop();
  };

  return { speak, stop, prefetch };
}
