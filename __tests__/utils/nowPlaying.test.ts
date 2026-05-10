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
    const remove = jest.fn();
    const native = jest.requireMock('../../modules/expo-now-playing/src/ExpoNowPlayingModule').default;
    native.addListener.mockReturnValue({ remove });

    const handler = jest.fn();
    const unsub = nowPlaying.addListener('play', handler);
    expect(native.addListener).toHaveBeenCalledWith('play', handler);
    expect(remove).not.toHaveBeenCalled();

    unsub();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('multiple listeners for same event are independent', () => {
    const native = jest.requireMock('../../modules/expo-now-playing/src/ExpoNowPlayingModule').default;
    const removes: jest.Mock[] = [];
    native.addListener.mockImplementation(() => {
      const remove = jest.fn();
      removes.push(remove);
      return { remove };
    });

    const u1 = nowPlaying.addListener('next', jest.fn());
    const u2 = nowPlaying.addListener('next', jest.fn());
    expect(removes.length).toBe(2);

    u1();
    expect(removes[0]).toHaveBeenCalledTimes(1);
    expect(removes[1]).not.toHaveBeenCalled();

    u2();
    expect(removes[1]).toHaveBeenCalledTimes(1);
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
