const noop = () => {};

const fallback = {
  STATE_PLAYING: 0,
  STATE_PAUSED: 1,
  STATE_ERROR: 2,
  STATE_STOPPED: 3,
  STATE_BUFFERING: 4,
  enableBackgroundMode: noop,
  handleAudioInterruptions: noop,
  enableControl: noop,
  setNowPlaying: noop,
  updatePlayback: noop,
  resetNowPlaying: noop,
  on: noop,
  off: noop,
};

const resolved = (() => {
  try {
    const mod = require('react-native-music-control');
    const candidate = mod?.default ?? mod;
    if (candidate && typeof candidate === 'object' && typeof candidate.STATE_PLAYING !== 'undefined') {
      return candidate;
    }
  } catch {}

  return fallback;
})();

export default resolved;
