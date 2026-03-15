import { useState, useEffect, useCallback } from 'react';
import * as Speech from 'expo-speech';

export default function useSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
      // Check status periodically or use listeners if available?
      // Expo Speech doesn't have listeners for start/finish easily on all platforms in managed workflow?
      // Actually it does: Speech.isSpeakingAsync()
      // But we can track state locally.
  }, []);

  const speak = useCallback((text: string, options: Speech.SpeechOptions = {}) => {
    Speech.speak(text, {
      ...options,
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
      // Expo Speech pause/resume support varies. Android/iOS support pause.
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
