import React from 'react';
import { render, act } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import ReaderScreen from '../src/screens/ReaderScreen';
import StorageService from '../src/services/StorageService';
import nowPlaying from '../src/utils/nowPlaying';

import 'react-native-gesture-handler/jestSetup';

const mockTtsSpeak = jest.fn();

jest.mock('../src/utils/nowPlaying', () => ({
  __esModule: true,
  default: {
    update: jest.fn(),
    setState: jest.fn(),
    reset: jest.fn(),
    addListener: jest.fn(() => () => {}),
  },
}));

jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const View = require('react-native').View;
  return {
    GestureHandlerRootView: ({ children }: any) => <View>{children}</View>,
    State: {},
    PanGestureHandler: View,
    TapGestureHandler: View,
    FlingGestureHandler: View,
    ForceTouchGestureHandler: View,
    LongPressGestureHandler: View,
    NativeViewGestureHandler: View,
  };
});

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View, FlatList } = require('react-native');

  const AnimatedFlatList = jest.fn((props: any) => {
    (AnimatedFlatList as any).latestProps = props;
    return <FlatList {...props} />;
  });

  return {
    __esModule: true,
    default: {
      createAnimatedComponent: (Component: any) => Component,
      View: View,
      FlatList: AnimatedFlatList,
      Text: View,
      Image: View,
      ScrollView: View,
    },
    useAnimatedRef: jest.fn(() => ({ current: { scrollToIndex: jest.fn(), scrollToOffset: jest.fn() } })),
    useSharedValue: jest.fn(() => ({ value: 0 })),
    useDerivedValue: jest.fn(() => ({ value: 0 })),
    useAnimatedStyle: jest.fn(() => ({})),
    useAnimatedProps: jest.fn(() => ({})),
    withTiming: jest.fn((val) => val),
    withSpring: jest.fn((val) => val),
    withDelay: jest.fn((delay, val) => val),
    withSequence: jest.fn(),
    scrollTo: jest.fn(),
    useFrameCallback: jest.fn(() => ({ setActive: jest.fn() })),
    useAnimatedScrollHandler: jest.fn(() => () => {}),
    runOnJS: jest.fn((fn) => fn),
    runOnUI: jest.fn((fn) => fn),
  };
});

jest.mock('expo-speech', () => ({
  stop: jest.fn(),
  speak: jest.fn(),
  getAvailableVoicesAsync: jest.fn().mockResolvedValue([]),
}));

jest.mock('expo-font', () => ({
  isLoaded: jest.fn().mockReturnValue(true),
  loadAsync: jest.fn().mockResolvedValue(true),
}));

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Ionicons: () => <View testID="icon-ionicon" />,
    MaterialIcons: () => <View testID="icon-material" />,
  };
});

jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(),
  deactivateKeepAwake: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  const SafeAreaContext = React.createContext(inset);
  return {
    SafeAreaProvider: ({ children }: any) => <SafeAreaContext.Provider value={inset}>{children}</SafeAreaContext.Provider>,
    SafeAreaConsumer: SafeAreaContext.Consumer,
    SafeAreaInsetsContext: SafeAreaContext,
    useSafeAreaInsets: jest.fn().mockReturnValue(inset),
  };
});

jest.mock('../src/services/BookService', () => ({
  getBooks: jest.fn().mockResolvedValue([{ id: 'book1', title: 'Test Book', filePath: 'test.txt' }]),
  updateBook: jest.fn().mockResolvedValue({}),
}));

jest.mock('../src/services/ChapterService', () => ({
  getChapterContent: jest.fn((_path: string, start: number) =>
    Promise.resolve(start === 0 ? '第一句。第二句。' : '第三句。')
  ),
}));

jest.mock('../src/services/StorageService', () => ({
  getData: jest.fn(),
  storeData: jest.fn(),
}));

jest.mock('../src/hooks/useSettings', () => ({
  __esModule: true,
  default: () => ({
    settings: {
      flipMode: 'scroll',
      fontSize: 18,
      theme: 'light',
      speechRate: 1.0,
      voiceType: 'default',
    },
    updateSettings: jest.fn(),
  }),
}));

jest.mock('../src/hooks/useTts', () => ({
  __esModule: true,
  default: () => ({
    speak: mockTtsSpeak,
    stop: jest.fn().mockResolvedValue(undefined),
    prefetch: jest.fn(),
  }),
}));

jest.mock('../src/services/tts/XfyunTtsProvider', () => ({
  XfyunTtsProvider: jest.fn().mockImplementation(() => ({
    speak: jest.fn(),
    stop: jest.fn().mockResolvedValue(undefined),
    prefetch: jest.fn(),
  })),
}));

jest.mock('../src/services/tts/LocalTtsProvider', () => ({
  LocalTtsProvider: jest.fn().mockImplementation(() => ({
    speak: jest.fn(),
    stop: jest.fn().mockResolvedValue(undefined),
    prefetch: jest.fn(),
  })),
}));

jest.mock('../src/i18n', () => ({
  __esModule: true,
  default: () => ({
    t: (key: string) => key,
    language: 'zh',
  }),
}));

const Stack = createStackNavigator();

const renderReader = () =>
  render(
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Reader" component={ReaderScreen} initialParams={{ bookId: 'book1' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );

const getRemoteHandler = (event: string) => {
  const call = (nowPlaying.addListener as jest.Mock).mock.calls.find(c => c[0] === event);
  return call?.[1] as () => void;
};

describe('ReaderScreen TTS chapter advance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (StorageService.getData as jest.Mock).mockImplementation((key: string) => {
      if (key.includes('chapters')) {
        return Promise.resolve([
          { id: 'ch1', title: 'Chapter 1', startPosition: 0, endPosition: 100 },
          { id: 'ch2', title: 'Chapter 2', startPosition: 100, endPosition: 200 },
        ]);
      }
      return Promise.resolve(null);
    });
  });

  it('continues into the next chapter when it was not loaded yet', async () => {
    renderReader();

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 200));
    });

    // Start speech the same way the lock-screen play button does.
    await act(async () => {
      getRemoteHandler('play')();
      await new Promise(resolve => setTimeout(resolve, 200));
    });

    const spokenTexts = mockTtsSpeak.mock.calls.map(c => c[0]);
    expect(spokenTexts).toEqual(['第一句。', '第二句。']);

    // Last sentence of chapter 1 finishes — chapter 2 is not in chaptersData yet.
    const lastOptions = mockTtsSpeak.mock.calls[mockTtsSpeak.mock.calls.length - 1][1];
    await act(async () => {
      lastOptions.onDone();
      await new Promise(resolve => setTimeout(resolve, 300));
    });

    expect(mockTtsSpeak.mock.calls.map(c => c[0])).toEqual(['第一句。', '第二句。', '第三句。']);
  });
});
