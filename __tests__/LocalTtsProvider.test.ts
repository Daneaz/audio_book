import { LocalTtsProvider } from '../src/services/tts/LocalTtsProvider';

const mockSpeak = jest.fn();
const mockStop = jest.fn().mockResolvedValue(undefined);

jest.mock('expo-speech', () => ({
  speak: (...args: any[]) => mockSpeak(...args),
  stop: () => mockStop(),
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

jest.mock('../src/utils/textUtils', () => ({
  splitIntoSubClauses: jest.fn((text: string) => [text]),
}));

describe('LocalTtsProvider', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls Speech.speak with the sentence text', () => {
    const provider = new LocalTtsProvider(undefined);
    provider.speak('你好世界', { language: 'zh-CN', rate: 1.0 });
    expect(mockSpeak).toHaveBeenCalledWith(
      '你好世界',
      expect.objectContaining({ language: 'zh-CN', rate: 1.0 })
    );
  });

  it('passes voice identifier when provided', () => {
    const provider = new LocalTtsProvider('com.apple.voice.premium.zh-CN.Lili');
    provider.speak('测试', {});
    expect(mockSpeak).toHaveBeenCalledWith(
      '测试',
      expect.objectContaining({ voice: 'com.apple.voice.premium.zh-CN.Lili' })
    );
  });

  it('passes undefined voice when identifier is not provided', () => {
    const provider = new LocalTtsProvider(undefined);
    provider.speak('测试', {});
    expect(mockSpeak).toHaveBeenCalledWith(
      '测试',
      expect.objectContaining({ voice: undefined })
    );
  });

  it('stop calls Speech.stop', async () => {
    const provider = new LocalTtsProvider(undefined);
    await provider.stop();
    expect(mockStop).toHaveBeenCalled();
  });

  it('prefetch is a no-op', async () => {
    const provider = new LocalTtsProvider(undefined);
    await expect(provider.prefetch('text')).resolves.toBeUndefined();
    expect(mockSpeak).not.toHaveBeenCalled();
  });

  it('invokes onDone after the last subclause finishes', () => {
    jest.useFakeTimers();
    const onDone = jest.fn();
    const provider = new LocalTtsProvider(undefined);
    provider.speak('你好', { onDone });

    const { onDone: speechOnDone } = mockSpeak.mock.calls[0][1];
    speechOnDone();
    jest.runAllTimers();

    expect(onDone).toHaveBeenCalled();
    jest.useRealTimers();
  });
});
