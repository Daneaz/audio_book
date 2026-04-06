import { useState, useCallback } from 'react';
import { Platform } from 'react-native';
import * as Speech from 'expo-speech';

export default function useSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const speak = useCallback(async (text: string, options: Speech.SpeechOptions = {}) => {
    Speech.speak(text, {
      ...options,
      ...(Platform.OS === 'ios' && { useApplicationAudioSession: false }),
      onStart: () => setIsSpeaking(true),
      onDone: () => {
          setIsSpeaking(false);
          setIsPaused(false);
      },
      onStopped: () => {
          setIsSpeaking(false);
          setIsPaused(false);
      },
      onError: (e) => {
          console.error("Speech error", e);
          setIsSpeaking(false);
          setIsPaused(false);
      }
    });
    setIsSpeaking(true);
    setIsPaused(false);
  }, []);

  const stop = useCallback(async () => {
    await Speech.stop();
    setIsSpeaking(false);
    setIsPaused(false);
  }, []);

  const pause = useCallback(async () => {
      await Speech.pause();
      setIsPaused(true);
  }, []);

  const resume = useCallback(async () => {
      await Speech.resume();
      setIsPaused(false);
  }, []);

  return {
    isSpeaking,
    isPaused,
    speak,
    stop,
    pause,
    resume
  };
}
