import { renderHook, act } from '@testing-library/react-native';
import useTts from '../src/hooks/useTts';

const mockLocalSpeak = jest.fn();
const mockLocalStop = jest.fn().mockResolvedValue(undefined);
const mockLocalPrefetch = jest.fn().mockResolvedValue(undefined);
const mockXfyunSpeak = jest.fn();
const mockXfyunStop = jest.fn().mockResolvedValue(undefined);
const mockXfyunPrefetch = jest.fn().mockResolvedValue(undefined);

jest.mock('../src/services/tts/LocalTtsProvider', () => ({
  LocalTtsProvider: jest.fn().mockImplementation(() => ({
    speak: mockLocalSpeak,
    stop: mockLocalStop,
    prefetch: mockLocalPrefetch,
  })),
}));

jest.mock('../src/services/tts/XfyunTtsProvider', () => ({
  XfyunTtsProvider: jest.fn().mockImplementation(() => ({
    speak: mockXfyunSpeak,
    stop: mockXfyunStop,
    prefetch: mockXfyunPrefetch,
  })),
}));

describe('useTts', () => {
  const { LocalTtsProvider } = require('../src/services/tts/LocalTtsProvider');
  const { XfyunTtsProvider } = require('../src/services/tts/XfyunTtsProvider');

  beforeEach(() => jest.clearAllMocks());

  it('creates LocalTtsProvider with undefined for "default" voiceType', () => {
    renderHook(() => useTts('default'));
    expect(LocalTtsProvider).toHaveBeenCalledWith(undefined);
    expect(XfyunTtsProvider).not.toHaveBeenCalled();
  });

  it('creates LocalTtsProvider with identifier for local voice', () => {
    renderHook(() => useTts('com.apple.voice.premium.zh-CN.Lili'));
    expect(LocalTtsProvider).toHaveBeenCalledWith('com.apple.voice.premium.zh-CN.Lili');
    expect(XfyunTtsProvider).not.toHaveBeenCalled();
  });

  it('creates XfyunTtsProvider with voiceId for xfyun voice', () => {
    renderHook(() => useTts('xfyun:xiaoyan'));
    expect(XfyunTtsProvider).toHaveBeenCalledWith('xiaoyan');
    expect(LocalTtsProvider).not.toHaveBeenCalled();
  });

  it('routes speak() to LocalTtsProvider for local voice', () => {
    const { result } = renderHook(() => useTts('default'));
    act(() => result.current.speak('你好', {}));
    expect(mockLocalSpeak).toHaveBeenCalledWith('你好', {});
  });

  it('routes speak() to XfyunTtsProvider for xfyun voice', () => {
    const { result } = renderHook(() => useTts('xfyun:xiaoyu'));
    act(() => result.current.speak('你好', {}));
    expect(mockXfyunSpeak).toHaveBeenCalledWith('你好', {});
  });

  it('routes prefetch() to correct provider', () => {
    const { result } = renderHook(() => useTts('xfyun:xiaoyan'));
    act(() => result.current.prefetch('预取'));
    expect(mockXfyunPrefetch).toHaveBeenCalledWith('预取');
  });

  it('stop() resolves without error', async () => {
    const { result } = renderHook(() => useTts('default'));
    await act(async () => {
      await result.current.stop();
    });
    expect(mockLocalStop).toHaveBeenCalled();
  });

  it('stops previous provider when voiceType changes', async () => {
    const { rerender } = renderHook(({ v }) => useTts(v), { initialProps: { v: 'default' } });
    expect(LocalTtsProvider).toHaveBeenCalledTimes(1);

    await act(async () => {
      rerender({ v: 'xfyun:xiaoyan' });
    });

    expect(mockLocalStop).toHaveBeenCalled();
    expect(XfyunTtsProvider).toHaveBeenCalledWith('xiaoyan');
  });

  it('does not rebuild provider when voiceType stays the same', () => {
    const { rerender } = renderHook(({ v }) => useTts(v), { initialProps: { v: 'xfyun:xiaoyan' } });
    rerender({ v: 'xfyun:xiaoyan' });
    expect(XfyunTtsProvider).toHaveBeenCalledTimes(1);
  });

  it('switches from xfyun to local and stops xfyun provider', async () => {
    const { rerender } = renderHook(({ v }) => useTts(v), { initialProps: { v: 'xfyun:xiaoyu' } });

    await act(async () => {
      rerender({ v: 'default' });
    });

    expect(mockXfyunStop).toHaveBeenCalled();
    expect(LocalTtsProvider).toHaveBeenCalledWith(undefined);
  });
});
