jest.mock('react-native-music-control', () => ({
  __esModule: true,
  default: null,
}));

import MusicControl from '../src/utils/musicControl.native';

describe('musicControl.native fallback', () => {
  it('exposes constants even when native module is unavailable', () => {
    expect(MusicControl.STATE_PLAYING).toBeDefined();
    expect(typeof MusicControl.enableBackgroundMode).toBe('function');
    expect(() => MusicControl.enableBackgroundMode(true)).not.toThrow();
  });
});

