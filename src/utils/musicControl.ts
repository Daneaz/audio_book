const noop = () => {};

const MusicControl = {
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

export default MusicControl;
