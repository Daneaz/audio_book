import { useEffect, useMemo, useRef } from 'react';
import { LocalTtsProvider } from '../services/tts/LocalTtsProvider';
import { XfyunTtsProvider } from '../services/tts/XfyunTtsProvider';
import { TtsOptions, TtsProvider } from '../services/tts/TtsProvider';
import { isXfyunVoice } from '../utils/voiceUtils';

function createProvider(voiceType: string): TtsProvider {
  if (isXfyunVoice(voiceType)) {
    return new XfyunTtsProvider(voiceType);
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
