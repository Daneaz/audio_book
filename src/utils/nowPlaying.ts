import ExpoNowPlaying from '../../modules/expo-now-playing/src/ExpoNowPlayingModule';
import {
  NowPlayingEvent,
  NowPlayingMetadata,
  NowPlayingState,
} from '../../modules/expo-now-playing/src/ExpoNowPlaying.types';

export interface NowPlaying {
  update(metadata: NowPlayingMetadata): Promise<void>;
  setState(state: NowPlayingState): Promise<void>;
  reset(): Promise<void>;
  addListener(event: NowPlayingEvent, handler: () => void): () => void;
}

const nowPlaying: NowPlaying = {
  update(metadata) {
    return ExpoNowPlaying.update(metadata);
  },
  setState(state) {
    return ExpoNowPlaying.setState(state);
  },
  reset() {
    return ExpoNowPlaying.reset();
  },
  addListener(event, handler) {
    const sub = ExpoNowPlaying.addListener(event, handler);
    return () => {
      sub.remove();
    };
  },
};

export default nowPlaying;
