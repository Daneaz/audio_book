import React from 'react';
import { render, act } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import ReaderScreen from '../src/screens/ReaderScreen';
import StorageService from '../src/services/StorageService';
import ChapterService from '../src/services/ChapterService';
import BookService from '../src/services/BookService';

import 'react-native-gesture-handler/jestSetup';

jest.mock('react-native-music-control', () => ({
  __esModule: true,
  default: {
    STATE_PLAYING: 0,
    STATE_PAUSED: 1,
    STATE_ERROR: 2,
    STATE_STOPPED: 3,
    STATE_BUFFERING: 4,
    enableBackgroundMode: jest.fn(),
    handleAudioInterruptions: jest.fn(),
    enableControl: jest.fn(),
    setNowPlaying: jest.fn(),
    updatePlayback: jest.fn(),
    resetNowPlaying: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
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
  
  // We need to capture the props passed to FlatList to manually trigger events
  const AnimatedFlatList = jest.fn((props: any) => {
    // Store onViewableItemsChanged to trigger it later
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
  getChapterContent: jest.fn().mockResolvedValue('This is a test sentence.'),
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

jest.mock('../src/i18n', () => ({
  __esModule: true,
  default: () => ({
    t: (key: string) => key,
    language: 'zh',
  }),
}));

const Stack = createStackNavigator();

describe('ReaderScreen Chapter Jump Bugfix', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (StorageService.getData as jest.Mock).mockImplementation((key) => {
      if (key.includes('chapters')) {
        // Return two chapters so jumping to ch2 makes ch1 the "previous" chapter
        return Promise.resolve([
          { id: 'ch1', title: 'Chapter 1', startPosition: 0, endPosition: 100 },
          { id: 'ch2', title: 'Chapter 2', startPosition: 100, endPosition: 200 }
        ]);
      }
      return Promise.resolve(null);
    });
  });

  it('should not load previous chapter while restoring scroll position after a chapter jump', async () => {
    const getChapterContentSpy = jest.spyOn(ChapterService, 'getChapterContent');
    const { requireMock } = jest;
    const reanimatedMock = require('react-native-reanimated');
    
    // Render the screen jumping directly to chapter 2
    render(
      <NavigationContainer>
        <Stack.Navigator>
          <Stack.Screen 
            name="Reader" 
            component={ReaderScreen} 
            initialParams={{ bookId: 'book1', chapterId: 'ch2' }} 
          />
        </Stack.Navigator>
      </NavigationContainer>
    );

    // Wait for the initial load to complete
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    // Extract the onViewableItemsChanged prop passed to FlatList
    const flatListProps = reanimatedMock.default.FlatList.latestProps;
    expect(flatListProps).toBeDefined();
    
    // Simulate FlatList rendering ch2 at index 0
    await act(async () => {
      if (flatListProps.onViewableItemsChanged) {
        flatListProps.onViewableItemsChanged({
          viewableItems: [
            { index: 0, item: { chapter: { id: 'ch2', title: 'Chapter 2' } } }
          ]
        });
      }
    });

    // Wait to confirm the bug is fixed: ch1 should NOT be loaded during scroll restoration.
    // suppressStartReachedRef stays true until the user manually scrolls, so ch1 preload
    // is permanently suppressed after a chapter jump (not just for 250ms).
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 400));
    });

    expect(getChapterContentSpy).toHaveBeenCalledTimes(1);
    expect(getChapterContentSpy).toHaveBeenCalledWith(expect.any(String), 100, 200); // ch2 only
  });

  it('should not reload book data after chaptersData changes during a chapter jump', async () => {
    render(
      <NavigationContainer>
        <Stack.Navigator>
          <Stack.Screen
            name="Reader"
            component={ReaderScreen}
            initialParams={{ bookId: 'book1', chapterId: 'ch2' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    );

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 500));
    });

    expect(BookService.getBooks).toHaveBeenCalledTimes(1);
  });
});
