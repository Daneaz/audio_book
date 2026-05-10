export type NowPlayingMetadata = {
  title: string;
  subtitle: string;
  artworkUri?: string;
};

export type NowPlayingState = 'playing' | 'paused' | 'stopped';

export type NowPlayingEvent =
  | 'play'
  | 'pause'
  | 'next'
  | 'previous'
  | 'interruption-begin'
  | 'interruption-end';

export type ExpoNowPlayingEvents = {
  [K in NowPlayingEvent]: () => void;
};
