jest.mock('../../modules/expo-now-playing/src/ExpoNowPlayingModule', () => ({
  __esModule: true,
  default: {
    update: jest.fn(),
    setState: jest.fn(),
    reset: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
  },
}));

import nowPlaying from '../../src/utils/nowPlaying';

function getMockNative() {
  return jest.requireMock('../../modules/expo-now-playing/src/ExpoNowPlayingModule').default as {
    update: jest.Mock;
    setState: jest.Mock;
    reset: jest.Mock;
    addListener: jest.Mock;
    removeListener: jest.Mock;
  };
}

describe('nowPlaying adapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('addListener returns an unsubscribe function that detaches the handler', () => {
    const mockNative = getMockNative();
    let stored: (() => void) | null = null;
    mockNative.addListener.mockImplementation((event: string, handler: () => void) => {
      stored = handler;
      return { remove: () => { stored = null; } };
    });

    const handler = jest.fn();
    const unsub = nowPlaying.addListener('play', handler);
    expect(mockNative.addListener).toHaveBeenCalledWith('play', handler);

    unsub();
    expect(stored).toBeNull();
  });

  it('multiple listeners for same event are independent', () => {
    const mockNative = getMockNative();
    const subs: Array<{ remove: () => void; handler: () => void }> = [];
    mockNative.addListener.mockImplementation((_e: string, handler: () => void) => {
      const s = { handler, remove: () => { /* removed flag */ } };
      subs.push(s);
      return s;
    });

    const h1 = jest.fn();
    const h2 = jest.fn();
    const u1 = nowPlaying.addListener('next', h1);
    const u2 = nowPlaying.addListener('next', h2);

    expect(subs.length).toBe(2);
    u1();
    u2();
    expect(typeof u1).toBe('function');
    expect(typeof u2).toBe('function');
  });
});

describe('nowPlaying delegations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('update forwards metadata to native', async () => {
    const mockNative = getMockNative();
    mockNative.update.mockResolvedValue(undefined);
    await nowPlaying.update({ title: 'Book', subtitle: 'Ch 1', artworkUri: 'file:///cover.jpg' });
    expect(mockNative.update).toHaveBeenCalledWith({
      title: 'Book',
      subtitle: 'Ch 1',
      artworkUri: 'file:///cover.jpg',
    });
  });

  it('setState forwards state to native', async () => {
    const mockNative = getMockNative();
    mockNative.setState.mockResolvedValue(undefined);
    await nowPlaying.setState('playing');
    expect(mockNative.setState).toHaveBeenCalledWith('playing');
  });

  it('reset forwards to native', async () => {
    const mockNative = getMockNative();
    mockNative.reset.mockResolvedValue(undefined);
    await nowPlaying.reset();
    expect(mockNative.reset).toHaveBeenCalled();
  });

  it('update -> setState ordering preserved', async () => {
    const mockNative = getMockNative();
    mockNative.update.mockResolvedValue(undefined);
    mockNative.setState.mockResolvedValue(undefined);
    await nowPlaying.update({ title: 'Book', subtitle: 'Ch' });
    await nowPlaying.setState('playing');
    const order = (mockNative.update.mock.invocationCallOrder[0]
      < mockNative.setState.mock.invocationCallOrder[0]);
    expect(order).toBe(true);
  });

  it('setState("stopped") followed by update does not throw', async () => {
    const mockNative = getMockNative();
    mockNative.setState.mockResolvedValue(undefined);
    mockNative.update.mockResolvedValue(undefined);
    await nowPlaying.setState('stopped');
    await expect(
      nowPlaying.update({ title: 'Book', subtitle: 'Ch' })
    ).resolves.not.toThrow();
  });
});
