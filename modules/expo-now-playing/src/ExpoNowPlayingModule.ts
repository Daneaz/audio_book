import { NativeModule, requireNativeModule } from 'expo';
import {
  ExpoNowPlayingEvents,
  NowPlayingMetadata,
  NowPlayingState,
} from './ExpoNowPlaying.types';

declare class ExpoNowPlayingModule extends NativeModule<ExpoNowPlayingEvents> {
  update(metadata: NowPlayingMetadata): Promise<void>;
  setState(state: NowPlayingState): Promise<void>;
  reset(): Promise<void>;
}

export default requireNativeModule<ExpoNowPlayingModule>('ExpoNowPlaying');
