import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, Dimensions, TouchableOpacity, ActivityIndicator, StatusBar, Platform, ViewToken, ScrollView, useColorScheme, FlatListProps, AppState, Modal, Animated as RNAnimated } from 'react-native';
import Animated, { useAnimatedRef, useSharedValue, scrollTo, useFrameCallback, useAnimatedScrollHandler, runOnJS } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import MusicControl from 'react-native-music-control';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import BookService from '../services/BookService';
import ChapterService from '../services/ChapterService';
import StorageService from '../services/StorageService';
import { STORAGE_KEYS } from '../utils/constants';
import { Book, Chapter, ReadingProgress } from '../types';
import { parseSentences, ParsedSentence, prepareSentenceForTts, normalizeDisplayParagraphSpacing } from '../utils/textUtils';
import { FONT_PRESET_OPTIONS, getFontFamilyForPreset } from '../utils/fontUtils';
import useSettings from '../hooks/useSettings';
import useI18n from '../i18n';
import { TranslationKey } from '../i18n/translations';

interface ChapterData {
  chapter: Chapter;
  content: string;
  sentences: ParsedSentence[];
}

interface PageData {
  id: string;
  chapter: Chapter;
  content: string;
  pageNumber: number;
  pageCount: number;
  charStart: number; // offset in normalized chapter content
}

interface HighlightFragment {
  text: string;
  highlighted: boolean;
}

const PAGE_BREAK_REGEX = /[\n。！？；!?;]/;
const PAGE_BREAK_SEARCH_RANGE = 120;
const TAP_MOVE_THRESHOLD = 10;
const AUTO_SCROLL_MIN_SPEED = 10;
const AUTO_SCROLL_MAX_SPEED = 80;
const STRONG_SPEECH_TIMER_SNAP_POINTS = [15, 30, 60];
const WEAK_SPEECH_TIMER_SNAP_POINTS = [90];
const STRONG_SPEECH_TIMER_SNAP_THRESHOLD = 6;
const WEAK_SPEECH_TIMER_SNAP_THRESHOLD = 3;
const EXCLUDED_VOICE_NAMES = new Set([
  'Zarvox',
  'Wobble',
  'Whisper',
  'Trinoids',
  'Organ',
  'Jester',
  'Good News',
  'Cellos',
  'Bubbles',
  'Boing',
  'Bells',
  'Bahh',
  'Bad News',
  'Albert',
]);

function getVoiceLanguageLabel(language: string | undefined, t: (key: TranslationKey) => string) {
  const normalized = (language || '').toLowerCase();
  if (normalized.startsWith('yue') || normalized.startsWith('zh-hk') || normalized.startsWith('zh-mo')) {
    return t('voice.cantonese');
  }
  if (normalized.startsWith('zh')) return t('voice.chinese');
  if (normalized.startsWith('en')) return t('voice.english');
  return language || '';
}

function getVoiceDisplayLabel(
  voice: { identifier: string; name?: string; language?: string } | null,
  fallback: string,
  t: (key: TranslationKey) => string,
  locale: 'zh' | 'en'
) {
  if (!voice) return fallback;
  const languageLabel = getVoiceLanguageLabel(voice.language, t);
  const name = voice.name || voice.identifier;
  return languageLabel ? `${name}${locale === 'en' ? ` (${languageLabel})` : `（${languageLabel}）`}` : name;
}

function splitChapterIntoPages(content: string, charsPerLine: number, linesPerPage: number): string[] {
  const normalized = content.replace(/\r\n/g, '\n');
  if (!normalized.trim()) return [''];
  if (charsPerLine <= 0 || linesPerPage <= 0) return [normalized];

  const pages: string[] = [];
  let pos = 0;

  while (pos < normalized.length) {
    let lineCount = 0;
    let lineChars = 0;
    let i = pos;

    for (; i < normalized.length; i++) {
      const char = normalized[i];

      if (char === '\n') {
        lineCount++;
        lineChars = 0;
        if (lineCount >= linesPerPage) {
          i++;
          break;
        }
      } else {
        lineChars++;
        if (lineChars > charsPerLine) {
          lineCount++;
          lineChars = 1;
          if (lineCount >= linesPerPage) {
            break;
          }
        }
      }
    }

    if (i >= normalized.length) {
      pages.push(normalized.slice(pos));
      break;
    }

    const searchStart = Math.max(pos, i - PAGE_BREAK_SEARCH_RANGE);
    let breakAt = -1;
    for (let j = i - 1; j >= searchStart; j--) {
      if (PAGE_BREAK_REGEX.test(normalized[j])) {
        breakAt = j + 1;
        break;
      }
    }

    const pageEnd = breakAt > pos ? breakAt : i;
    pages.push(normalized.slice(pos, pageEnd));
    pos = pageEnd;
  }

  return pages.length > 0 ? pages : [''];
}

function getHighlightedFragments(
  content: string,
  sentence: ParsedSentence | null
): HighlightFragment[] {
  if (!sentence) {
    return [{ text: content, highlighted: false }];
  }

  const before = content.slice(0, sentence.start);
  const current = content.slice(sentence.start, sentence.end);
  const after = content.slice(sentence.end);

  return [
    { text: before, highlighted: false },
    { text: current, highlighted: true },
    { text: after, highlighted: false },
  ].filter((fragment) => fragment.text.length > 0);
}

function getPageHighlightedFragments(
  pageContent: string,
  sentenceText: string | null
): HighlightFragment[] {
  if (!sentenceText) {
    return [{ text: pageContent, highlighted: false }];
  }

  const index = pageContent.indexOf(sentenceText);
  if (index === -1) {
    return [{ text: pageContent, highlighted: false }];
  }

  const before = pageContent.slice(0, index);
  const current = pageContent.slice(index, index + sentenceText.length);
  const after = pageContent.slice(index + sentenceText.length);

  return [
    { text: before, highlighted: false },
    { text: current, highlighted: true },
    { text: after, highlighted: false },
  ].filter((fragment) => fragment.text.length > 0);
}

interface ReaderChapterItemProps {
  item: ChapterData;
  isHorizontal: boolean;
  windowWidth: number;
  topInset: number;
  textColor: string;
  fontSize: number;
  lineHeight: number;
  fontFamily: string | undefined;
  isDark: boolean;
  isSpeaking: boolean;
  activeSentence: ParsedSentence | null;
  onLayoutChapter: (chapterId: string, y: number, height: number) => void;
  onSelectSentence: (chapterId: string, sentences: ParsedSentence[], start: number) => void;
}

const ReaderChapterItem = React.memo(({
  item,
  isHorizontal,
  windowWidth,
  topInset,
  textColor,
  fontSize,
  lineHeight,
  fontFamily,
  isDark,
  isSpeaking,
  activeSentence,
  onLayoutChapter,
  onSelectSentence,
}: ReaderChapterItemProps) => {
  const displayContent = useMemo(() => normalizeDisplayParagraphSpacing(item.content), [item.content]);
  const fragments = useMemo(() => activeSentence
    ? getHighlightedFragments(displayContent, activeSentence)
    : [{ text: displayContent, highlighted: false }], [displayContent, activeSentence]);

  return (
    <View
      style={[styles.chapterContainer, isHorizontal && { width: windowWidth, paddingHorizontal: 20, paddingTop: topInset + 40, marginTop: 0 }]}
      onLayout={(e) => {
        onLayoutChapter(item.chapter.id, e.nativeEvent.layout.y, e.nativeEvent.layout.height);
      }}
    >
      <Text style={[styles.chapterTitle, { color: textColor }]}>{item.chapter.title}</Text>
      {isSpeaking ? (
        <Text
          selectable
          style={[styles.content, { fontSize, color: textColor, lineHeight, fontFamily }]}
        >
          {fragments.map((fragment, index) => (
            <Text
              key={`${item.chapter.id}_fragment_${index}`}
              style={fragment.highlighted ? [styles.highlightedSentence, { backgroundColor: isDark ? '#3A2E12' : '#F7E8C4', color: textColor }] : undefined}
            >
              {fragment.text}
            </Text>
          ))}
        </Text>
      ) : (
        <TextInput
          value={displayContent}
          multiline
          editable={false}
          scrollEnabled={false}
          style={[styles.content, { fontSize, color: textColor, lineHeight, fontFamily }]}
          onSelectionChange={(e) => onSelectSentence(item.chapter.id, item.sentences, e.nativeEvent.selection.start)}
        />
      )}
      {!isHorizontal && <View style={styles.chapterDivider} />}
    </View>
  );
}, (prev, next) => {
  const prevSentence = prev.activeSentence;
  const nextSentence = next.activeSentence;
  const sentenceUnchanged =
    prevSentence === nextSentence ||
    (
      prevSentence?.start === nextSentence?.start &&
      prevSentence?.end === nextSentence?.end &&
      prevSentence?.text === nextSentence?.text
    );

  return (
    prev.item === next.item &&
    prev.isHorizontal === next.isHorizontal &&
    prev.windowWidth === next.windowWidth &&
    prev.topInset === next.topInset &&
    prev.textColor === next.textColor &&
    prev.fontSize === next.fontSize &&
    prev.lineHeight === next.lineHeight &&
    prev.fontFamily === next.fontFamily &&
    prev.isDark === next.isDark &&
    prev.isSpeaking === next.isSpeaking &&
    sentenceUnchanged
  );
});

interface ReaderPageItemProps {
  item: PageData;
  windowWidth: number;
  topPadding: number;
  bottomPadding: number;
  textColor: string;
  fontSize: number;
  lineHeight: number;
  fontFamily: string | undefined;
  contentHeight: number;
  isDark: boolean;
  isMenuVisible: boolean;
  activeSentenceText: string | null;
}

const ReaderPageItem = React.memo(({
  item,
  windowWidth,
  topPadding,
  bottomPadding,
  textColor,
  fontSize,
  lineHeight,
  fontFamily,
  contentHeight,
  isDark,
  isMenuVisible,
  activeSentenceText,
}: ReaderPageItemProps) => {
  const fragments = useMemo(() => activeSentenceText
    ? getPageHighlightedFragments(item.content, activeSentenceText)
    : [{ text: item.content, highlighted: false }], [item.content, activeSentenceText]);

  return (
    <View style={[styles.pageContainer, { width: windowWidth, paddingTop: topPadding, paddingBottom: bottomPadding }]}>
      {item.pageNumber === 1 ? (
        <Text style={[styles.chapterTitle, { color: textColor }]} numberOfLines={1}>
          {item.chapter.title}
        </Text>
      ) : null}
      <Text
        style={[
          styles.pageContent,
          {
            color: textColor,
            fontSize,
            lineHeight,
            fontFamily,
            height: contentHeight,
          },
        ]}
      >
        {fragments.map((fragment, index) => (
          <Text
            key={`${item.id}_fragment_${index}`}
            style={fragment.highlighted ? [styles.highlightedSentence, { backgroundColor: isDark ? '#3A2E12' : '#F7E8C4', color: textColor }] : undefined}
          >
            {fragment.text}
          </Text>
        ))}
      </Text>
      <Text style={[styles.pageIndicator, styles.pageIndicatorOverlay, { color: isDark ? '#888' : '#777', opacity: isMenuVisible ? 1 : 0 }]}>
        {item.pageNumber} / {item.pageCount}
      </Text>
    </View>
  );
}, (prev, next) => (
  prev.item === next.item &&
  prev.windowWidth === next.windowWidth &&
  prev.topPadding === next.topPadding &&
  prev.bottomPadding === next.bottomPadding &&
  prev.textColor === next.textColor &&
  prev.fontSize === next.fontSize &&
  prev.lineHeight === next.lineHeight &&
  prev.fontFamily === next.fontFamily &&
  prev.contentHeight === next.contentHeight &&
  prev.isDark === next.isDark &&
  prev.isMenuVisible === next.isMenuVisible &&
  prev.activeSentenceText === next.activeSentenceText
));

export default function ReaderScreen({ route, navigation }: any) {
  const { bookId, chapterId } = route.params;
  const insets = useSafeAreaInsets();
  
  const [book, setBook] = useState<Book | null>(null);
  const [allChapters, setAllChapters] = useState<Chapter[]>([]);
  
  // Data for FlatList
  const [chaptersData, setChaptersData] = useState<ChapterData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingPrevRef = useRef(false);
  const [readerListKey, setReaderListKey] = useState(0);

  // Chapter sliding window state
  const [chapterWindow, setChapterWindow] = useState<{
    prevId: string | null;
    currentId: string;
    nextId: string | null;
    isPreloading: boolean;
    isBackLoading: boolean;
  }>({ prevId: null, currentId: '', nextId: null, isPreloading: false, isBackLoading: false });
  const chapterProgressRef = useRef(0);
  
  // Navigation & UI state
  const [currentHeaderTitle, setCurrentHeaderTitle] = useState('');
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  
  // Speech state
  const [isSpeaking, setIsSpeaking] = useState(false);
  const isSpeakingRef = useRef(false);
  const startSpeechRef = useRef<() => void>(() => {});
  const stopSpeechRef = useRef<() => void>(() => {});
  const [currentSpeakingChapterId, setCurrentSpeakingChapterId] = useState<string | null>(null);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
  const [selectedSentence, setSelectedSentence] = useState<{ chapterId: string; sentenceIndex: number } | null>(null);
  
  // Timer
  const [timerDuration, setTimerDuration] = useState<number | null>(null);
  const [timerRemaining, setTimerRemaining] = useState<number | null>(null);
  const [isSpeechTimerPanelVisible, setIsSpeechTimerPanelVisible] = useState(false);
  const [isTypographyPanelVisible, setIsTypographyPanelVisible] = useState(false);
  const [isTtsOverlayVisible, setIsTtsOverlayVisible] = useState(false);
  const waveAnims = useRef(
    Array.from({ length: 7 }, (_, i) => new RNAnimated.Value(0.3 + i * 0.1))
  ).current;
  const [isSpeechTimerEnabled, setIsSpeechTimerEnabled] = useState(false);
  const [speechTimerMinutes, setSpeechTimerMinutes] = useState(15);
  const [speechTimerWidth, setSpeechTimerWidth] = useState(0);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voices, setVoices] = useState<Array<{ identifier: string; name?: string; language?: string }>>([]);
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);
  const [isVoiceDropdownVisible, setIsVoiceDropdownVisible] = useState(false);
  const speechTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  const { settings, updateSettings } = useSettings();
  const { t, language } = useI18n();
  
  const flatListRef = useAnimatedRef<Animated.FlatList<ChapterData | PageData>>();
  const chapterLayoutsRef = useRef<Record<string, { y: number; height: number }>>({});
  const autoFlipTimer = useRef<NodeJS.Timeout | null>(null);
  const scrollToIndexRetryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const userDraggingRef = useRef(false);
  const isMomentumScrollingRef = useRef(false);
  const lastUserScrollRef = useRef<number>(0);

  const scrollPos = useSharedValue(0);
  const isAutoScrolling = useSharedValue(false);
  const isHorizontalScrollMode = useSharedValue(settings.flipMode === 'horizontal');
  const autoScrollOffset = useSharedValue(0);
  const autoScrollSpeed = useSharedValue(0);
  // Must be declared before scrollHandler so worklet closure captures the initialized value
  const overscrollBackLoadTriggeredShared = useSharedValue(false);

  const frameCallback = useFrameCallback((frameInfo) => {
    'worklet';
    const delta = autoScrollSpeed.value * Math.min(frameInfo.timeSincePreviousFrame ?? 16, 32) / 1000;
    autoScrollOffset.value += delta;
    scrollTo(flatListRef, 0, autoScrollOffset.value, false);
  }, false);

  // Tracking
  const lastSelectionRef = useRef<{ chapterId: string, start: number, timestamp: number } | null>(null);
  const viewableItemsRef = useRef<ViewToken[]>([]);
  const triggerProgressCheckRef = useRef<() => void>(() => {});
  const isPreloadingRef = useRef(false);
  const backLoadFailedRef = useRef(false);
  const suppressStartReachedRef = useRef(false);
  const handleOverscrollBackLoadRef = useRef<() => Promise<void>>(async () => {});

  const _onOverscrollJS = () => { handleOverscrollBackLoadRef.current(); };
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      'worklet';
      const rawOffset = isHorizontalScrollMode.value
        ? event.contentOffset.x
        : event.contentOffset.y;
      if (!isAutoScrolling.value) {
        scrollPos.value = rawOffset;
      }
      // Detect pull past start boundary (overscroll): negative offset beyond threshold
      if (rawOffset < -60 && !overscrollBackLoadTriggeredShared.value) {
        overscrollBackLoadTriggeredShared.value = true;
        runOnJS(_onOverscrollJS)();
      }
    },
    onEndDrag: () => {
      'worklet';
      // Reset per-gesture guard so next drag can trigger again if needed
      overscrollBackLoadTriggeredShared.value = false;
    },
  });
  const loadedChapterIdsRef = useRef<Set<string>>(new Set());
  const lastSavedChapterIdRef = useRef<string | null>(null);
  const pendingRestoreRef = useRef<{ offset: number; page: number; mode: string; scrollToItemIndex?: number } | null>(null);
  const saveCurrentProgressRef = useRef<() => void>(() => {});


  useEffect(() => {
    let cancelled = false;

    const loadVoices = async () => {
      setVoicesLoading(true);
      try {
        const available = await Speech.getAvailableVoicesAsync();
        if (cancelled) return;

        const normalized = (available || [])
          .map((v: any) => ({
            identifier: String(v.identifier),
            name: typeof v.name === 'string' ? v.name : undefined,
            language: typeof v.language === 'string' ? v.language : undefined,
          }))
          .filter((v) => {
            if (!v.identifier) return false;
            const language = (v.language || '').toLowerCase();
            if (!(language.startsWith('zh') || language.startsWith('en') || language.startsWith('yue'))) return false;
            if (v.name && EXCLUDED_VOICE_NAMES.has(v.name)) return false;
            return true;
          });

        setVoices(normalized);
      } finally {
        if (!cancelled) setVoicesLoading(false);
      }
    };

    loadVoices();
    return () => {
      cancelled = true;
    };
  }, []);

  // Handle speech settings changes
  // When speech settings change, we don't stop the current reading.
  // Instead, the next sentence will use the new settings because we use settingsRef.
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    isHorizontalScrollMode.value = settings.flipMode === 'horizontal';
  }, [settings.flipMode]);

  // Restore reading position after initial load
  useEffect(() => {
    if (loading || !pendingRestoreRef.current) return;
    const restore = pendingRestoreRef.current;
    pendingRestoreRef.current = null;
    setTimeout(() => {
      if (restore.scrollToItemIndex !== undefined) {
        if (restore.mode === 'horizontal') {
          const targetChapter = chaptersData[restore.scrollToItemIndex];
          if (targetChapter) {
            const pageIdx = horizontalPages.findIndex(p => p.chapter.id === targetChapter.chapter.id);
            if (pageIdx !== -1) {
              const offset = pageIdx * window.width;
              flatListRef.current?.scrollToOffset({ offset, animated: false });
              scrollPos.value = offset;
            }
          }
        } else {
          flatListRef.current?.scrollToIndex({ index: restore.scrollToItemIndex, animated: false });
        }
      } else if (restore.mode === 'horizontal' && restore.page > 0) {
        const offset = restore.page * window.width;
        flatListRef.current?.scrollToOffset({ offset, animated: false });
        scrollPos.value = offset;
      } else if (restore.mode === 'scroll' && restore.offset > 0) {
        flatListRef.current?.scrollToOffset({ offset: restore.offset, animated: false });
        scrollPos.value = restore.offset;
      }
    }, 80);
  }, [loading]);

  // Auto-scroll to follow the speaking sentence
  const USER_SCROLL_COOLDOWN = 5 * 1000; // Reduced from 60s to 5s for better tracking resumption
  useEffect(() => {
    if (!isSpeaking || !currentSpeakingChapterId || userDraggingRef.current) return;
    if (Date.now() - lastUserScrollRef.current < USER_SCROLL_COOLDOWN) return;

    if (settings.flipMode === 'horizontal') {
      const sentenceText = activeSentence?.text;
      if (!sentenceText) return;
      const pageIndex = horizontalPages.findIndex(
        (page) => page.chapter.id === currentSpeakingChapterId && page.content.includes(sentenceText)
      );
      if (pageIndex !== -1) {
        flatListRef.current?.scrollToIndex({ index: pageIndex, animated: true });
      }
    } else {
      const chLayout = chapterLayoutsRef.current[currentSpeakingChapterId];
      if (!chLayout) {
        const chapterIndex = chaptersData.findIndex((c) => c.chapter.id === currentSpeakingChapterId);
        if (chapterIndex !== -1) {
          flatListRef.current?.scrollToIndex({ index: chapterIndex, animated: true, viewPosition: 0 });
        }
        return;
      }
      const chData = chaptersData.find((c) => c.chapter.id === currentSpeakingChapterId);
      if (!chData) return;
      const sentence = chData.sentences[currentSentenceIndex];
      if (!sentence) return;

      const ratio = sentence.start / Math.max(1, chData.content.length);
      const estimatedY = chLayout.y + ratio * chLayout.height;
      const currentOffset = isAutoScrolling.value ? autoScrollOffset.value : scrollPos.value;
      const screenHeight = window.height;

      // Follow when it goes near the bottom (e.g. 80%)
      if (estimatedY > currentOffset + screenHeight * 0.55) {
        const targetOffset = Math.max(0, estimatedY);
        if (isAutoScrolling.value) {
          autoScrollOffset.value = targetOffset;
        }
        flatListRef.current?.scrollToOffset({
          offset: targetOffset,
          animated: true,
        });
      }
    }
  }, [currentSentenceIndex, currentSpeakingChapterId, isSpeaking]);

  // Handle auto-flip / scroll
  useEffect(() => {
    if (settings.autoFlip) {
      startAutoFlip();
    } else {
      stopAutoFlip();
    }
    return () => stopAutoFlip();
  }, [settings.autoFlip, settings.flipInterval, settings.flipMode]);

  const startAutoFlip = () => {
    stopAutoFlip();

    if (settings.flipMode === 'scroll') {
      const speed = Math.min(Math.max(settings.flipInterval || 30, AUTO_SCROLL_MIN_SPEED), AUTO_SCROLL_MAX_SPEED);
      autoScrollOffset.value = scrollPos.value;
      autoScrollSpeed.value = speed;
      isAutoScrolling.value = true;
      frameCallback.setActive(true);
      return;
    }

    const interval = Math.max(settings.flipInterval || 30, 5) * 1000;
    autoFlipTimer.current = setInterval(() => {
      if (!flatListRef.current) return;

      const nextOffset = scrollPos.value + window.width;
      flatListRef.current.scrollToOffset({
        offset: nextOffset,
        animated: true,
      });
      scrollPos.value = nextOffset;
    }, interval);
  };

  const stopAutoFlip = () => {
    if (autoFlipTimer.current) {
      clearInterval(autoFlipTimer.current);
      autoFlipTimer.current = null;
    }
    if (isAutoScrolling.value) {
      frameCallback.setActive(false);
      isAutoScrolling.value = false;
      scrollPos.value = autoScrollOffset.value;
    }
  };

  const resumeAutoFlipIfNeeded = () => {
    if (!settings.autoFlip || settings.flipMode !== 'scroll' || userDraggingRef.current || isMomentumScrollingRef.current) {
      return;
    }
    if (autoFlipTimer.current || isAutoScrolling.value) {
      return;
    }
    startAutoFlip();
  };

  const markBookAsRecentlyRead = async (targetBook: Book) => {
    const updatedBook: Book = {
      ...targetBook,
      lastReadAt: new Date().toISOString(),
    };
    setBook(updatedBook);
    await BookService.updateBook(updatedBook);
    return updatedBook;
  };

  const loadBookData = async () => {
    try {
      const books = await BookService.getBooks();
      const currentBook = books.find(b => b.id === bookId);
      if (!currentBook) {
        navigation.goBack();
        return;
      }
      const recentlyReadBook = await markBookAsRecentlyRead(currentBook);

      const loadedChapters = await StorageService.getData(`${STORAGE_KEYS.CHAPTERS_PREFIX}${bookId}`);
      const chaptersList = loadedChapters || [];
      setAllChapters(chaptersList);

      // Determine start chapter index
      let startIdx = 0;
      let isChapterJump = false;
      if (chapterId) {
          const idx = chaptersList.findIndex((c: Chapter) => c.id === chapterId);
          if (idx !== -1) startIdx = idx;
          isChapterJump = true;
      } else {
          // Load progress
          const progressKey = `${STORAGE_KEYS.READING_PROGRESS_PREFIX}${bookId}`;
          const progress = await StorageService.getData(progressKey);
          if (progress && progress.chapterId) {
              const idx = chaptersList.findIndex((c: Chapter) => c.id === progress.chapterId);
              if (idx !== -1) startIdx = idx;
              if ((progress.currentPosition > 0) || (progress.currentPage > 0)) {
                pendingRestoreRef.current = {
                  offset: progress.currentPosition || 0,
                  page: progress.currentPage || 0,
                  mode: progress.readingMode || 'scroll',
                };
              }
          }
      }

      if (isChapterJump) {
        setLoading(true);
        scrollPos.value = 0;
        viewableItemsRef.current = [];
        lastSavedChapterIdRef.current = null;
        setSelectedSentence(null);
        setCurrentSpeakingChapterId(null);
        setCurrentSentenceIndex(0);
        setChaptersData([]);
        setReaderListKey((prev) => prev + 1);
      }
      chapterLayoutsRef.current = {};
      chapterProgressRef.current = 0;
      isPreloadingRef.current = false;
      backLoadFailedRef.current = false;
      suppressStartReachedRef.current = true; // cleared on first user scroll
      // Load only the current chapter; next chapter is preloaded lazily when user reaches 80%
      await loadChaptersBatch(chaptersList, startIdx, 1, recentlyReadBook, true);
      const startChapter = chaptersList[startIdx];
      if (startChapter) {
        setChapterWindow({
          prevId: null,
          currentId: startChapter.id,
          nextId: null,
          isPreloading: false,
          isBackLoading: false,
        });
      }
      if (isChapterJump) {
        pendingRestoreRef.current = {
          offset: 0,
          page: 0,
          mode: settings.flipMode,
          scrollToItemIndex: 0,
        };
      }
      
      setLoading(false);
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  const loadChaptersBatch = async (
    all: Chapter[], 
    startIndex: number, 
    count: number, 
    currentBook: Book,
    reset: boolean = false
  ) => {
    if (startIndex >= all.length) return;
    
    const newData: ChapterData[] = [];
    const endIndex = Math.min(startIndex + count, all.length);
    
    for (let i = startIndex; i < endIndex; i++) {
      const ch = all[i];
      if (loadedChapterIdsRef.current.has(ch.id) && !reset) continue;
      
      loadedChapterIdsRef.current.add(ch.id);
      try {
        const content = await ChapterService.getChapterContent(currentBook.filePath, ch.startPosition, ch.endPosition);
        const sentences = parseSentences(content);
        newData.push({
          chapter: ch,
          content,
          sentences
        });
      } catch (e) {
        if (!reset) loadedChapterIdsRef.current.delete(ch.id);
        console.error(`Error loading chapter ${ch.id}`, e);
      }
    }
    
    if (reset) {
      loadedChapterIdsRef.current.clear();
      newData.forEach(d => loadedChapterIdsRef.current.add(d.chapter.id));
      setChaptersData(newData);
      if (newData.length > 0) {
        setCurrentHeaderTitle(newData[0].chapter.title);
      }
    } else {
      setChaptersData(prev => [...prev, ...newData]);
    }
  };

  const handleEndReached = () => {
    if (loadingMore || loading || !book || isPreloadingRef.current) return;

    const lastLoaded = chaptersData[chaptersData.length - 1];
    if (!lastLoaded) return;

    const lastIndex = allChapters.findIndex(c => c.id === lastLoaded.chapter.id);
    if (lastIndex !== -1 && lastIndex < allChapters.length - 1) {
      setLoadingMore(true);
      loadChaptersBatch(allChapters, lastIndex + 1, 1, book).finally(() => {
        setLoadingMore(false);
      });
    }
  };

  // Case 1: lazy-load the previous chapter when user scrolls to top (normal flow)
  const handleStartReached = async () => {
    if (loadingPrevRef.current || loading || !book) return;

    const firstLoaded = chaptersData[0];
    if (!firstLoaded) return;

    const firstIndex = allChapters.findIndex(c => c.id === firstLoaded.chapter.id);
    if (firstIndex <= 0) return;

    const ch = allChapters[firstIndex - 1];
    if (loadedChapterIdsRef.current.has(ch.id)) return; // already loaded or was evicted (handled by overscroll)

    loadingPrevRef.current = true;
    loadedChapterIdsRef.current.add(ch.id);
    try {
      const content = await ChapterService.getChapterContent(book.filePath, ch.startPosition, ch.endPosition);
      const sentences = parseSentences(content);
      setChaptersData(prev => [{ chapter: ch, content, sentences }, ...prev]);
      setChapterWindow(prev => ({ ...prev, prevId: ch.id }));
    } catch (e) {
      loadedChapterIdsRef.current.delete(ch.id);
      console.error(`Error loading previous chapter ${ch.id}`, e);
    } finally {
      loadingPrevRef.current = false;
    }
  };

  // Case 2: user actively pulled past the start boundary — reload evicted chapter B
  const handleOverscrollBackLoad = async () => {
    if (loadingPrevRef.current || loading || !book || backLoadFailedRef.current) return;
    if (chapterWindow.prevId !== null) return; // B is still in memory, nothing to reload

    const firstLoaded = chaptersData[0];
    if (!firstLoaded) return;

    const firstIndex = allChapters.findIndex(c => c.id === firstLoaded.chapter.id);
    if (firstIndex <= 0) return;

    const ch = allChapters[firstIndex - 1];
    if (loadedChapterIdsRef.current.has(ch.id)) return;

    loadingPrevRef.current = true;
    setChapterWindow(prev => ({ ...prev, isBackLoading: true }));
    loadedChapterIdsRef.current.add(ch.id);
    try {
      const content = await ChapterService.getChapterContent(book.filePath, ch.startPosition, ch.endPosition);
      const sentences = parseSentences(content);
      setChaptersData(prev => [{ chapter: ch, content, sentences }, ...prev]);
      setChapterWindow(prev => ({ ...prev, prevId: ch.id, isBackLoading: false }));

      if (settings.flipMode === 'scroll') {
        setTimeout(() => {
          const layout = chapterLayoutsRef.current[ch.id];
          if (layout) {
            flatListRef.current?.scrollToOffset({
              offset: Math.max(0, layout.y + layout.height - window.height * 0.8),
              animated: false,
            });
          }
        }, 150);
      } else {
        setTimeout(() => {
          const pages = horizontalPages.filter(p => p.chapter.id === ch.id);
          const lastPage = pages[pages.length - 1];
          if (lastPage) {
            const lastIdx = horizontalPages.findIndex(p => p.id === lastPage.id);
            if (lastIdx >= 0) {
              flatListRef.current?.scrollToIndex({ index: lastIdx, animated: false });
            }
          }
        }, 80);
      }
    } catch (e) {
      loadedChapterIdsRef.current.delete(ch.id);
      console.error(`Error back-loading chapter ${ch.id}`, e);
      backLoadFailedRef.current = true;
      setChapterWindow(prev => ({ ...prev, isBackLoading: false }));
    } finally {
      loadingPrevRef.current = false;
    }
  };

  const handleStartReachedRef = useRef<() => Promise<void>>(async () => {});
  handleStartReachedRef.current = handleStartReached;
  handleOverscrollBackLoadRef.current = handleOverscrollBackLoad;

  const getChapterReadProgress = (): number => {
    const isHoriz = settings.flipMode === 'horizontal';
    const currentId = chapterWindow.currentId;
    if (!currentId) return 0;

    if (isHoriz) {
      if (horizontalPages.length === 0) return 0;
      const pageIndex = Math.max(0, Math.round(scrollPos.value / Math.max(window.width, 1)));
      const chapterPageIndices: number[] = [];
      horizontalPages.forEach((p, i) => { if (p.chapter.id === currentId) chapterPageIndices.push(i); });
      if (chapterPageIndices.length === 0) return 0;
      const posInChapter = pageIndex - chapterPageIndices[0];
      return Math.min(1, Math.max(0, posInChapter / chapterPageIndices.length));
    } else {
      const layout = chapterLayoutsRef.current[currentId];
      if (!layout || layout.height === 0) return 0;
      return Math.min(1, Math.max(0, (scrollPos.value - layout.y) / layout.height));
    }
  };

  const handleProgressChange = async (progress: number) => {
    if (!book) return;

    // Trigger: >80% in current chapter → silently preload next chapter
    if (
      progress >= 0.8 &&
      !isPreloadingRef.current &&
      chapterWindow.nextId === null
    ) {
      const currentIdx = allChapters.findIndex(c => c.id === chapterWindow.currentId);
      if (currentIdx !== -1 && currentIdx < allChapters.length - 1) {
        const nextChapter = allChapters[currentIdx + 1];
        if (loadedChapterIdsRef.current.has(nextChapter.id)) return;

        isPreloadingRef.current = true;
        setChapterWindow(prev => ({ ...prev, isPreloading: true }));
        loadedChapterIdsRef.current.add(nextChapter.id);
        try {
          const content = await ChapterService.getChapterContent(book.filePath, nextChapter.startPosition, nextChapter.endPosition);
          const sentences = parseSentences(content);
          setChaptersData(prev => [...prev, { chapter: nextChapter, content, sentences }]);
          setChapterWindow(prev => ({ ...prev, nextId: nextChapter.id, isPreloading: false }));
        } catch (e) {
          loadedChapterIdsRef.current.delete(nextChapter.id);
          setChapterWindow(prev => ({ ...prev, isPreloading: false }));
        } finally {
          isPreloadingRef.current = false;
        }
      }
    }

    // Trigger: >50% in current chapter AND prev chapter exists → unload prev chapter
    if (progress >= 0.5 && chapterWindow.prevId !== null) {
      const idToUnload = chapterWindow.prevId;
      setChaptersData(prev => prev.filter(c => c.chapter.id !== idToUnload));
      loadedChapterIdsRef.current.delete(idToUnload);
      setChapterWindow(prev => ({ ...prev, prevId: null }));
    }
  };

  const maybeHandleProgress = () => {
    const progress = getChapterReadProgress();
    if (Math.abs(progress - chapterProgressRef.current) >= 0.05) {
      chapterProgressRef.current = progress;
      void handleProgressChange(progress);
    }
  };

  triggerProgressCheckRef.current = maybeHandleProgress;

  const saveProgress = async (cId: string) => {
      const isHoriz = settings.flipMode === 'horizontal';
      let savedPage = 0;
      if (isHoriz) {
        const visibleItem = viewableItemsRef.current[0]?.item as (PageData | ChapterData) | undefined;
        if (visibleItem && 'pageNumber' in visibleItem) {
          const idx = horizontalPages.findIndex((p) => p.id === (visibleItem as PageData).id);
          savedPage = Math.max(0, idx);
        }
      }
      const currentOffset = isAutoScrolling.value ? autoScrollOffset.value : scrollPos.value;
      const progress: ReadingProgress = {
          id: `progress_${bookId}`,
          bookId,
          chapterId: cId,
          currentPosition: isHoriz ? 0 : Math.round(currentOffset),
          currentPage: savedPage,
          readingMode: settings.flipMode,
          updatedAt: new Date().toISOString()
      };
      await StorageService.storeData(`${STORAGE_KEYS.READING_PROGRESS_PREFIX}${bookId}`, progress);
  };

  // Speech Logic
  const toggleSpeech = () => {
      if (isSpeaking) {
          stopSpeech();
      } else {
          setIsTypographyPanelVisible(false);
          startSpeech(null);
      }
  };

  const toggleTypographyPanel = () => {
      setIsSpeechTimerPanelVisible(false);
      setIsVoiceDropdownVisible(false);
      setIsTypographyPanelVisible((visible) => !visible);
  };

  const startSpeech = (duration: number | null = timerDuration, hidePanel: boolean = true) => {
      Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        allowsRecordingIOS: false,
      }).catch(() => {});
      setIsSpeaking(true);
      isSpeakingRef.current = true;
      if (hidePanel) {
          setIsSpeechTimerPanelVisible(false);
      }
      setTimerDuration(duration);
      if (duration !== null) {
          setTimerRemaining(duration * 60);
      } else {
          setTimerRemaining(null);
      }

      // Determine start point
      let startChapterId = chaptersData[0]?.chapter.id;
      let startSentenceIndex = 0;
      
      // 1. Check selection
      const now = Date.now();
      const lastSel = lastSelectionRef.current;
      
      if (lastSel && (now - lastSel.timestamp < 10000)) { // Valid within 10s
        const targetChapter = chaptersData.find(c => c.chapter.id === lastSel.chapterId);
        if (targetChapter) {
          startChapterId = lastSel.chapterId;
          // Find sentence containing start index
          const sIdx = targetChapter.sentences.findIndex(s => lastSel.start >= s.start && lastSel.start < s.end);
          if (sIdx !== -1) startSentenceIndex = sIdx;
        }
      } else {
        // 2. From current page start
        if (viewableItemsRef.current.length > 0) {
           const firstVisible = viewableItemsRef.current[0].item as PageData | ChapterData;
           startChapterId = firstVisible.chapter.id;
           if ('charStart' in firstVisible) {
             // Horizontal page mode: find first sentence on this page
             const chData = chaptersData.find(c => c.chapter.id === startChapterId);
             if (chData) {
               const pageStartNorm = firstVisible.charStart;
               const rawContent = chData.content;
               let rawOffset = 0;
               let normOffset = 0;
               while (rawOffset < rawContent.length && normOffset < pageStartNorm) {
                 if (rawContent[rawOffset] === '\r' && rawContent[rawOffset + 1] === '\n') {
                   rawOffset += 2;
                 } else {
                   rawOffset++;
                 }
                 normOffset++;
               }
               const sIdx = chData.sentences.findIndex(s => s.end > rawOffset);
               startSentenceIndex = sIdx !== -1 ? sIdx : 0;
             }
           } else {
             // Scroll mode: find first sentence at screen top
             const topY = scrollPos.value;
             for (const cd of chaptersData) {
               const cl = chapterLayoutsRef.current[cd.chapter.id];
               if (!cl) continue;
               // We only want the chapter that is currently visible at the top of the screen
               if (topY >= cl.y && topY < cl.y + cl.height) {
                 startChapterId = cd.chapter.id;
                 const ratio = Math.max(0, Math.min(1, (topY - cl.y) / cl.height));
                 const estimatedCharOffset = Math.floor(ratio * cd.content.length);
                 
                 // Find the start of the paragraph that contains this offset
                 let pStart = estimatedCharOffset;
                 while (pStart > 0 && cd.content[pStart - 1] !== '\n') {
                   pStart--;
                 }
                 
                 const sIdx = cd.sentences.findIndex(s => s.start >= pStart);
                 startSentenceIndex = sIdx !== -1 ? sIdx : 0;
                 break;
               }
             }
           }
        }
      }
      
      // Prevent auto-scroll jump when speech starts
      lastUserScrollRef.current = Date.now();
      
      if (startChapterId) {
        speakSentence(startChapterId, startSentenceIndex);
      }

      MusicControl.enableControl('play', true);
      MusicControl.enableControl('pause', true);
      MusicControl.enableControl('stop', true);
      MusicControl.enableControl('nextTrack', false);
      MusicControl.enableControl('previousTrack', false);

      const startingChapter = chaptersData.find(c => c.chapter.id === startChapterId);
      MusicControl.setNowPlaying({
        title: book?.title ?? '',
        artist: startingChapter?.chapter.title ?? '',
      });
      MusicControl.updatePlayback({ state: MusicControl.STATE_PLAYING });
  };

  const stopSpeech = () => {
      Speech.stop();
      MusicControl.resetNowPlaying();
      setIsSpeaking(false);
      isSpeakingRef.current = false;
      setIsSpeechTimerPanelVisible(false);
      setTimerDuration(null);
      setTimerRemaining(null);
      if (speechTimerRef.current) {
          clearInterval(speechTimerRef.current);
          speechTimerRef.current = null;
      }
  };

  useEffect(() => {
    startSpeechRef.current = startSpeech;
    stopSpeechRef.current = stopSpeech;
  });

  useEffect(() => {
    MusicControl.handleAudioInterruptions(true);

    MusicControl.on('play', () => {
      if (!isSpeakingRef.current) startSpeechRef.current();
    });
    MusicControl.on('pause', () => {
      if (isSpeakingRef.current) stopSpeechRef.current();
    });
    MusicControl.on('stop', () => {
      stopSpeechRef.current();
    });

    return () => {
      MusicControl.off('play');
      MusicControl.off('pause');
      MusicControl.off('stop');
      MusicControl.resetNowPlaying();
    };
  }, []);

  const speakSentence = (cId: string, sIndex: number) => {
      const chData = chaptersData.find(c => c.chapter.id === cId);
      if (!chData) {
        stopSpeech();
        return;
      }
      
      if (sIndex >= chData.sentences.length) {
        // Move to next chapter
        const chIdx = chaptersData.findIndex(c => c.chapter.id === cId);
        const nextCh = chaptersData[chIdx + 1];
        if (nextCh) {
          speakSentence(nextCh.chapter.id, 0);
        } else {
          // Try to load next chapter?
          // For now just stop.
          stopSpeech();
        }
        return;
      }
      
      setCurrentSpeakingChapterId(cId);
      setCurrentSentenceIndex(sIndex);
      
      const sentence = prepareSentenceForTts(chData.sentences[sIndex].text, 'offline');

      if (!sentence) {
        speakSentence(cId, sIndex + 1);
        return;
      }

      Speech.speak(sentence, {
          language: 'zh-CN',
          rate: settingsRef.current.speechRate,
          voice: settingsRef.current.voiceType === 'default' ? undefined : settingsRef.current.voiceType,
          onDone: () => {
             setTimeout(() => {
                 if (isSpeakingRef.current) { 
                     speakSentence(cId, sIndex + 1);
                 }
             }, 50);
          },
          onStopped: () => {
             // Handled by stopSpeech
          },
          onError: (e) => {
              console.error("Speech error", e);
              stopSpeech();
          }
      });
  };

  // Effects for timer
  useEffect(() => {
      if (isSpeaking && timerRemaining !== null) {
          speechTimerRef.current = setInterval(() => {
              setTimerRemaining(prev => {
                  if (prev === null || prev <= 0) {
                      stopSpeech();
                      return 0;
                  }
                  return prev - 1;
              });
          }, 1000);
      } else if (!isSpeaking && speechTimerRef.current) {
          clearInterval(speechTimerRef.current);
          speechTimerRef.current = null;
      }
      return () => {
          if (speechTimerRef.current) {
              clearInterval(speechTimerRef.current);
          }
      };
  }, [isSpeaking, timerRemaining]);

  // Clean up
  useEffect(() => {
      return () => {
          stopSpeech();
      };
  }, []);

  // Wave animation for TTS
  useEffect(() => {
    if (isSpeaking) {
      const animations = waveAnims.map((anim, i) =>
        RNAnimated.loop(
          RNAnimated.sequence([
            RNAnimated.delay(i * 80),
            RNAnimated.timing(anim, { toValue: 1, duration: 300 + i * 40, useNativeDriver: true }),
            RNAnimated.timing(anim, { toValue: 0.25, duration: 300 + i * 40, useNativeDriver: true }),
          ])
        )
      );
      RNAnimated.parallel(animations).start();
      return () => animations.forEach(a => a.stop());
    } else {
      waveAnims.forEach(a => a.setValue(0.3));
    }
  }, [isSpeaking]);

  const toggleTheme = () => {
      const next = settings.theme === 'dark' ? 'light' : 'dark';
      updateSettings({ theme: next });
  };

  const increaseFontSize = () => updateSettings({ fontSize: Math.min(settings.fontSize + 2, 30) });
  const decreaseFontSize = () => updateSettings({ fontSize: Math.max(settings.fontSize - 2, 12) });
  const increaseLineSpacing = () => updateSettings({ lineSpacing: Math.min(2.2, Number((settings.lineSpacing + 0.1).toFixed(1))) });
  const decreaseLineSpacing = () => updateSettings({ lineSpacing: Math.max(1.2, Number((settings.lineSpacing - 0.1).toFixed(1))) });

  const startSpeechWithTimer = () => {
      const duration = isSpeechTimerEnabled && speechTimerMinutes > 0 ? speechTimerMinutes : null;
      startSpeech(duration);
  };

  const previewVoice = async (voiceId: string, voiceLanguage?: string) => {
      // If we are already speaking, do not interrupt to preview.
      // The new voice will naturally take effect on the next sentence.
      if (isSpeakingRef.current) {
          return;
      }

      const normalizedLanguage = (voiceLanguage || '').toLowerCase();
      const previewText = normalizedLanguage.startsWith('zh') ? t('settings.voicePreviewZh') : t('settings.voicePreviewEn');
      const speechLanguage = normalizedLanguage.startsWith('zh') ? 'zh-CN' : 'en-US';

      Speech.stop();
      setPreviewingVoiceId(voiceId);

      Speech.speak(previewText, {
          language: speechLanguage,
          rate: settings.speechRate,
          voice: voiceId === 'default' ? undefined : voiceId,
          useApplicationAudioSession: false,
          onDone: () => setPreviewingVoiceId((current) => (current === voiceId ? null : current)),
          onStopped: () => setPreviewingVoiceId((current) => (current === voiceId ? null : current)),
          onError: () => setPreviewingVoiceId((current) => (current === voiceId ? null : current)),
      });
  };

  const getTimerText = () => {
      if (timerDuration === null) return t('reader.timerNone');
      if (isSpeaking && timerRemaining !== null) {
          const mins = Math.floor(timerRemaining / 60);
          const secs = timerRemaining % 60;
          return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
      }
      return `${timerDuration}m`;
  };

  useEffect(() => {
    if (settings.keepScreenAwake) {
      activateKeepAwakeAsync();
      return () => { deactivateKeepAwake(); };
    }
  }, [settings.keepScreenAwake]);

  const colorScheme = useColorScheme();
  const isDark = settings.theme === 'system' ? colorScheme === 'dark' : settings.theme === 'dark';

  const readerColors = useMemo(() => ({
    bg:           isDark ? '#0E0C0A' : '#FAF7F0',
    surface:      isDark ? '#1C1916' : '#F3ECE0',
    border:       isDark ? '#2A2520' : '#E0D4C0',
    accent:       isDark ? '#C4A96A' : '#A0621A',
    accentBg:     isDark ? 'rgba(196,169,106,0.1)'  : 'rgba(139,94,32,0.08)',
    accentBorder: isDark ? 'rgba(196,169,106,0.3)'  : 'rgba(139,94,32,0.25)',
    textPrimary:  isDark ? '#E8E0D0' : '#2C1A0E',
    textSub:      isDark ? '#B0A080' : '#9A7A5A',
    bottomBar:    isDark ? '#0A0806' : '#F3ECE0',
    iconBox:      isDark ? '#2A2520' : '#E8DCC8',
    highlight:    isDark ? '#3A2E12' : '#F7E8C4',
  }), [isDark]);

  const bgColor   = readerColors.bg;
  const textColor = readerColors.textPrimary;
  const window = Dimensions.get('window');
  const centerTapTop = window.height * 0.25;
  const centerTapBottom = window.height * 0.75;
  const lineHeight = settings.fontSize * settings.lineSpacing;
  const horizontalLineHeight = lineHeight;
  const fontFamily = getFontFamilyForPreset(settings.fontPreset);
  const horizontalContentWidth = Math.max(window.width - 40, 1);
  const horizontalTopPadding = insets.top + 12;
  const horizontalBottomPadding = insets.bottom + 18;
  const horizontalContentHeight = Math.max(window.height - horizontalTopPadding - horizontalBottomPadding, horizontalLineHeight);
  const charsPerLine = Math.max(Math.floor(horizontalContentWidth / (settings.fontSize * 1.05)), 1);
  const linesPerPage = Math.max(Math.floor(horizontalContentHeight / horizontalLineHeight), 1);
  const speechTimerRatio = speechTimerMinutes / 120;
  const speechTimerThumbOffset = speechTimerRatio * speechTimerWidth;
  const sortedVoices = useMemo(() => {
      const zh: typeof voices = [];
      const other: typeof voices = [];
      const iosZhAllowlist = ['tingting', 'meijia'];
      for (const v of voices) {
        if ((v.language || '').toLowerCase().startsWith('zh')) {
          if (Platform.OS === 'ios') {
            const id = (v.identifier || '').toLowerCase();
            if (!iosZhAllowlist.some((n) => id.includes(n))) continue;
          }
          zh.push(v);
        } else other.push(v);
      }
      const sortByLabel = (a: (typeof voices)[number], b: (typeof voices)[number]) => {
        const la = `${a.name || ''} ${a.language || ''} ${a.identifier}`.toLowerCase();
        const lb = `${b.name || ''} ${b.language || ''} ${b.identifier}`.toLowerCase();
        return la.localeCompare(lb);
      };
      zh.sort(sortByLabel);
      other.sort(sortByLabel);
      return [...zh, ...other];
  }, [voices]);
  const selectedVoiceLabel = useMemo(() => {
      if (!settings.voiceType || settings.voiceType === 'default') return t('common.default');
      const matchedVoice = voices.find((voice) => voice.identifier === settings.voiceType);
      if (!matchedVoice) return settings.voiceType;
      return getVoiceDisplayLabel(matchedVoice, settings.voiceType, t, language);
  }, [language, settings.voiceType, t, voices]);
  const fontOptionMeta = useMemo(
    () => ({
      system: { label: t('settings.fontSystemDefault') },
      hei: { label: t('settings.fontHei') },
      kai: { label: t('settings.fontKai') },
      song: { label: t('settings.fontSong') },
      mashan: { label: t('settings.fontMashan') },
    }),
    [t]
  );
  const typographyFontOptions = useMemo(
    () => FONT_PRESET_OPTIONS.filter((option) => option.id !== 'system'),
    []
  );

  const updateSpeechTimerFromPosition = (x: number) => {
      if (speechTimerWidth <= 0) return;
      const ratio = Math.max(0, Math.min(1, x / speechTimerWidth));
      const rawMinutes = Math.round(ratio * 120);
      const nearestStrongSnapPoint = STRONG_SPEECH_TIMER_SNAP_POINTS.reduce((closest, point) =>
        Math.abs(point - rawMinutes) < Math.abs(closest - rawMinutes) ? point : closest
      );
      const nearestWeakSnapPoint = WEAK_SPEECH_TIMER_SNAP_POINTS.reduce((closest, point) =>
        Math.abs(point - rawMinutes) < Math.abs(closest - rawMinutes) ? point : closest,
        WEAK_SPEECH_TIMER_SNAP_POINTS[0] ?? rawMinutes
      );
      const snappedMinutes =
        Math.abs(nearestStrongSnapPoint - rawMinutes) <= STRONG_SPEECH_TIMER_SNAP_THRESHOLD
          ? nearestStrongSnapPoint
          : Math.abs(nearestWeakSnapPoint - rawMinutes) <= WEAK_SPEECH_TIMER_SNAP_THRESHOLD
            ? nearestWeakSnapPoint
            : rawMinutes;
      setSpeechTimerMinutes(snappedMinutes);
      setIsSpeechTimerEnabled(snappedMinutes > 0);

      // If already speaking, update the running timer immediately
      if (isSpeakingRef.current) {
          if (snappedMinutes > 0) {
              setTimerDuration(snappedMinutes);
              setTimerRemaining(snappedMinutes * 60);
          } else {
              setTimerDuration(null);
              setTimerRemaining(null);
          }
      }
  };

  const horizontalPages = useMemo<PageData[]>(() => {
    if (settings.flipMode !== 'horizontal') {
      return [];
    }

    const pages = chaptersData.flatMap((chapterData) => {
      const displayContent = normalizeDisplayParagraphSpacing(chapterData.content);
      const splitPages = splitChapterIntoPages(displayContent, charsPerLine, linesPerPage);
      let cumOffset = 0;
      return splitPages.map((pageContent, index) => {
        const charStart = cumOffset;
        cumOffset += pageContent.length;
        return {
          id: `${chapterData.chapter.id}_page_${index + 1}`,
          chapter: chapterData.chapter,
          content: pageContent,
          pageNumber: index + 1,
          pageCount: splitPages.length,
          charStart,
        };
      });
    });

    return pages;
  }, [chaptersData, charsPerLine, linesPerPage, settings.flipMode]);

  const activeSentence = useMemo(() => {
    if (!isSpeaking) {
      return null;
    }

    if (!currentSpeakingChapterId) {
      return null;
    }

    const chapterData = chaptersData.find((chapter) => chapter.chapter.id === currentSpeakingChapterId);
    if (!chapterData) {
      return null;
    }

    return chapterData.sentences[currentSentenceIndex] || null;
  }, [chaptersData, currentSentenceIndex, currentSpeakingChapterId, isSpeaking]);

  const getCurrentVisibleReaderItem = useCallback((): PageData | ChapterData | null => {
    const visibleItem = viewableItemsRef.current[0]?.item as PageData | ChapterData | undefined;
    if (visibleItem) {
      return visibleItem;
    }

    if (settings.flipMode === 'horizontal') {
      if (horizontalPages.length === 0) return null;
      const pageIndex = Math.max(0, Math.min(horizontalPages.length - 1, Math.round(scrollPos.value / Math.max(window.width, 1))));
      return horizontalPages[pageIndex] || null;
    }

    const currentOffset = isAutoScrolling.value ? autoScrollOffset.value : scrollPos.value;
    const chapterFromLayout = chaptersData.find((chapterData) => {
      const layout = chapterLayoutsRef.current[chapterData.chapter.id];
      if (!layout) return false;
      return currentOffset >= layout.y && currentOffset < layout.y + layout.height;
    });

    return chapterFromLayout || chaptersData[0] || null;
  }, [chaptersData, horizontalPages, settings.flipMode, window.width]);

  const saveCurrentProgress = useCallback(() => {
    const currentItem = getCurrentVisibleReaderItem();
    if (!currentItem) return;
    lastSavedChapterIdRef.current = currentItem.chapter.id;
    void saveProgress(currentItem.chapter.id);
  }, [getCurrentVisibleReaderItem]);

  useEffect(() => {
    saveCurrentProgressRef.current = saveCurrentProgress;
  }, [saveCurrentProgress]);

  useEffect(() => {
    loadBookData();
    return () => {
      saveCurrentProgressRef.current();
      Speech.stop();
      stopAutoFlip();
      if (scrollToIndexRetryTimerRef.current) {
        clearTimeout(scrollToIndexRetryTimerRef.current);
        scrollToIndexRetryTimerRef.current = null;
      }
    };
  }, [bookId, chapterId]);

  useEffect(() => {
    const unsubscribeBeforeRemove = navigation.addListener('beforeRemove', () => {
      saveCurrentProgressRef.current();
    });

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'inactive' || nextAppState === 'background') {
        saveCurrentProgressRef.current();
      }
    });

    return () => {
      unsubscribeBeforeRemove();
      subscription.remove();
    };
  }, [navigation]);

  useEffect(() => {
    if (!isSpeaking || !currentSpeakingChapterId) return;
    const chData = chaptersData.find(c => c.chapter.id === currentSpeakingChapterId);
    MusicControl.setNowPlaying({
      title: book?.title ?? '',
      artist: chData?.chapter.title ?? '',
    });
    MusicControl.updatePlayback({ state: MusicControl.STATE_PLAYING });
  }, [currentSpeakingChapterId, isSpeaking, book]);

  const handleChapterLayout = useCallback((chapterId: string, y: number, height: number) => {
    chapterLayoutsRef.current[chapterId] = { y, height };
  }, []);

  const handleSentenceSelection = useCallback((chapterId: string, sentences: ParsedSentence[], start: number) => {
    const sentenceIndex = sentences.findIndex(
      (sentence) => start >= sentence.start && start < sentence.end
    );

    if (sentenceIndex !== -1) {
      setSelectedSentence({ chapterId, sentenceIndex });
    }

    lastSelectionRef.current = {
      chapterId,
      start,
      timestamp: Date.now(),
    };
  }, []);

  const isHorizontal = settings.flipMode === 'horizontal';
  const readerData = isHorizontal ? horizontalPages : chaptersData;
  const flatListData = readerData as ArrayLike<ChapterData | PageData>;
  const getHorizontalItemLayout = useCallback((_: ArrayLike<PageData> | null | undefined, index: number) => ({
    length: window.width,
    offset: window.width * index,
    index,
  }), [window.width]);

  const renderReaderItem = useCallback(({ item }: { item: PageData | ChapterData }) => {
    if (isHorizontal) {
      const pageItem = item as PageData;

      return (
        <ReaderPageItem
          item={pageItem}
          windowWidth={window.width}
          topPadding={horizontalTopPadding}
          bottomPadding={horizontalBottomPadding}
          textColor={textColor}
          fontSize={settings.fontSize}
          lineHeight={horizontalLineHeight}
          fontFamily={fontFamily}
          contentHeight={horizontalContentHeight}
          isDark={isDark}
          isMenuVisible={isMenuVisible}
          activeSentenceText={currentSpeakingChapterId === pageItem.chapter.id ? activeSentence?.text || null : null}
        />
      );
    }

    const chapterItem = item as ChapterData;
    return (
      <ReaderChapterItem
        item={chapterItem}
        isHorizontal={false}
        windowWidth={window.width}
        topInset={insets.top}
        textColor={textColor}
        fontSize={settings.fontSize}
        lineHeight={lineHeight}
        fontFamily={fontFamily}
        isDark={isDark}
        isSpeaking={isSpeaking && currentSpeakingChapterId === chapterItem.chapter.id}
        activeSentence={currentSpeakingChapterId === chapterItem.chapter.id ? activeSentence : null}
        onLayoutChapter={handleChapterLayout}
        onSelectSentence={handleSentenceSelection}
      />
    );
  }, [
    activeSentence,
    currentSpeakingChapterId,
    fontFamily,
    handleChapterLayout,
    handleSentenceSelection,
    horizontalBottomPadding,
    horizontalContentHeight,
    horizontalLineHeight,
    horizontalTopPadding,
    insets.top,
    isDark,
    isHorizontal,
    isMenuVisible,
    isSpeaking,
    lineHeight,
    settings.fontSize,
    textColor,
    window.width,
  ]);

  const getReaderItemKey = useCallback((item: PageData | ChapterData) =>
    'pageNumber' in item ? item.id : item.chapter.id, []);

  const handleScrollToIndexFailed = useCallback<NonNullable<FlatListProps<ChapterData | PageData>['onScrollToIndexFailed']>>((info) => {
    const estimatedOffset = Math.max(0, info.averageItemLength * info.index);
    flatListRef.current?.scrollToOffset({
      offset: estimatedOffset,
      animated: false,
    });

    if (scrollToIndexRetryTimerRef.current) {
      clearTimeout(scrollToIndexRetryTimerRef.current);
    }

    scrollToIndexRetryTimerRef.current = setTimeout(() => {
      flatListRef.current?.scrollToIndex({
        index: info.index,
        animated: false,
        viewPosition: 0,
      });
    }, 120);
  }, []);

  const onReaderViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    viewableItemsRef.current = viewableItems;
    if (viewableItems.length === 0) return;

    const first = viewableItems[0];
    const item = first.item as PageData | ChapterData;
    const chapter = item.chapter;

    if (!isAutoScrolling.value) {
      setCurrentHeaderTitle(chapter.title);
    }
    if (chapter.id !== lastSavedChapterIdRef.current) {
      lastSavedChapterIdRef.current = chapter.id;
      saveProgress(chapter.id);
    }

    // Detect chapter transition B→C
    setChapterWindow(prev => {
      if (prev.nextId && chapter.id === prev.nextId) {
        chapterProgressRef.current = 0;
        return { ...prev, prevId: prev.currentId, currentId: prev.nextId, nextId: null };
      }
      return prev;
    });

    if (first.index === 0 && !suppressStartReachedRef.current) {
      handleStartReachedRef.current?.();
    }

    // Check reading progress for preload/unload triggers
    triggerProgressCheckRef.current();
  }, []);

  const handleReaderTouchStart = (event: any) => {
    const { pageX, pageY } = event.nativeEvent;
    touchStartRef.current = { x: pageX, y: pageY };
  };

  const handleReaderTouchEnd = (event: any) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;

    if (!start) return;

    const { pageX, pageY } = event.nativeEvent;
    const moveX = Math.abs(pageX - start.x);
    const moveY = Math.abs(pageY - start.y);
    const isTap = moveX <= TAP_MOVE_THRESHOLD && moveY <= TAP_MOVE_THRESHOLD;
    const isInCenterBand = pageY >= centerTapTop && pageY <= centerTapBottom;

    if (isTap && isInCenterBand) {
      if (isSpeechTimerPanelVisible) {
        setIsSpeechTimerPanelVisible(false);
        setIsVoiceDropdownVisible(false);
        return;
      }
      if (isTypographyPanelVisible) {
        setIsTypographyPanelVisible(false);
        return;
      }
      setIsMenuVisible((visible) => !visible);
    }
  };

  const handleScrollBeginDrag = () => {
    suppressStartReachedRef.current = false;
    lastUserScrollRef.current = Date.now();
    if (!settings.autoFlip || settings.flipMode !== 'scroll') {
      return;
    }

    userDraggingRef.current = true;
    stopAutoFlip();
  };

  const handleScrollEndDrag = () => {
    const visibleItem = viewableItemsRef.current[0]?.item as PageData | ChapterData | undefined;
    if (visibleItem) saveProgress(visibleItem.chapter.id);

    if (!settings.autoFlip || settings.flipMode !== 'scroll') {
      return;
    }
    userDraggingRef.current = false;
  };

  const handleMomentumScrollBegin = () => {
    if (!settings.autoFlip || settings.flipMode !== 'scroll') {
      return;
    }

    isMomentumScrollingRef.current = true;
  };

  const handleMomentumScrollEnd = () => {
    const visibleItem = viewableItemsRef.current[0]?.item as PageData | ChapterData | undefined;
    if (visibleItem) saveProgress(visibleItem.chapter.id);

    if (!settings.autoFlip || settings.flipMode !== 'scroll') {
      return;
    }
    isMomentumScrollingRef.current = false;
    userDraggingRef.current = false;
    resumeAutoFlipIfNeeded();
  };

  const handleBack = () => {
    saveCurrentProgress();
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.replace('Bookshelf');
  };

  if (loading && !book) {
      return (
          <View style={[styles.container, styles.center]}>
              <ActivityIndicator size="large" />
          </View>
      );
  }

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} hidden={!isMenuVisible} />
      
      {/* Header */}
      {isMenuVisible && (
          <View style={[styles.header, { paddingTop: insets.top, backgroundColor: readerColors.surface, borderBottomColor: readerColors.border }]}>
              <TouchableOpacity onPress={handleBack} style={styles.iconButton}>
                  <Ionicons name="arrow-back" size={24} color={textColor} />
              </TouchableOpacity>
              <Text style={[styles.headerTitle, { color: textColor }]} numberOfLines={1}>
                  {currentHeaderTitle || book?.title}
              </Text>
              <View style={styles.headerActions}>
                <TouchableOpacity onPress={() => navigation.navigate('Chapters', { bookId })} style={styles.iconButton}>
                  <Ionicons name="list" size={24} color={textColor} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={styles.iconButton}>
                  <Ionicons name="settings-outline" size={22} color={textColor} />
                </TouchableOpacity>
              </View>
          </View>
      )}

      <Animated.FlatList
        key={`${settings.flipMode}:${readerListKey}`}
        ref={flatListRef}
        data={flatListData}
        renderItem={renderReaderItem}
        keyExtractor={getReaderItemKey}
        getItemLayout={isHorizontal ? (getHorizontalItemLayout as any) : undefined}
        onScrollToIndexFailed={handleScrollToIndexFailed}
        ListHeaderComponent={
          !isHorizontal && chapterWindow.isBackLoading ? (
            <View style={{ paddingVertical: 20, alignItems: 'center' }}>
              <ActivityIndicator size="large" color={textColor} />
            </View>
          ) : null
        }
        onEndReached={handleEndReached}
        onEndReachedThreshold={3.0}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        onViewableItemsChanged={onReaderViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 10 }}
        contentContainerStyle={
          isHorizontal
            ? undefined
            : { paddingHorizontal: 20, paddingVertical: 40, paddingBottom: 140 }
        }
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        horizontal={isHorizontal}
        pagingEnabled={isHorizontal}
        removeClippedSubviews={Platform.OS === 'android'}
        initialNumToRender={isHorizontal ? 3 : 2}
        windowSize={5}
        maxToRenderPerBatch={2}
        updateCellsBatchingPeriod={50}
        onTouchStart={handleReaderTouchStart}
        onTouchEnd={handleReaderTouchEnd}
        onScrollBeginDrag={handleScrollBeginDrag}
        onScrollEndDrag={handleScrollEndDrag}
        onMomentumScrollBegin={handleMomentumScrollBegin}
        onMomentumScrollEnd={handleMomentumScrollEnd}
      />

      {/* Back-loading overlay for horizontal mode */}
      {isHorizontal && chapterWindow.isBackLoading && (
        <View style={[StyleSheet.absoluteFillObject, { justifyContent: 'center', alignItems: 'center', backgroundColor: 'transparent' }]} pointerEvents="none">
          <ActivityIndicator size="large" color={textColor} />
        </View>
      )}

      {/* Mini 播放条 - Menu 隐藏时绝对定位 */}
      {isSpeaking && !isMenuVisible && (
        <TouchableOpacity
          onPress={() => setIsTtsOverlayVisible(true)}
          style={[styles.miniPlayer, {
            backgroundColor: readerColors.bottomBar,
            borderTopColor: readerColors.border,
            bottom: insets.bottom,
          }]}
          activeOpacity={0.85}
        >
          <View style={styles.miniWave}>
            {waveAnims.map((anim, i) => (
              <RNAnimated.View
                key={i}
                style={[styles.miniWaveBar, {
                  backgroundColor: readerColors.accent,
                  transform: [{ scaleY: anim }],
                }]}
              />
            ))}
          </View>
          <View style={styles.miniInfo}>
            <Text style={[styles.miniInfoLabel, { color: readerColors.accent }]} numberOfLines={1}>
              {t('reader.read')}
            </Text>
            <View style={[styles.miniProgressTrack, { backgroundColor: readerColors.border }]}>
              <View style={[styles.miniProgressFill, { backgroundColor: readerColors.accent, width: '38%' }]} />
            </View>
          </View>
          <TouchableOpacity onPress={(e) => { e.stopPropagation(); toggleSpeech(); }} style={styles.miniCtrl} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <View style={styles.miniPause}>
              <View style={[styles.miniPauseBar, { backgroundColor: readerColors.accent }]} />
              <View style={[styles.miniPauseBar, { backgroundColor: readerColors.accent }]} />
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={(e) => { e.stopPropagation(); stopSpeech(); }} style={styles.miniCtrl} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <View style={[styles.miniStop, { backgroundColor: readerColors.iconBox }]} />
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      {/* Footer Controls */}
      {isMenuVisible && (
          <View style={[styles.footer, { paddingBottom: insets.bottom + 10, backgroundColor: readerColors.bottomBar }]}>
              {/* Mini 播放条 - Menu 可见时显示在控制行上方 */}
              {isSpeaking && (
                <TouchableOpacity
                  onPress={() => setIsTtsOverlayVisible(true)}
                  style={[styles.miniPlayer, styles.miniPlayerInFooter, {
                    backgroundColor: readerColors.surface,
                    borderColor: readerColors.border,
                  }]}
                  activeOpacity={0.85}
                >
                  <View style={styles.miniWave}>
                    {waveAnims.map((anim, i) => (
                      <RNAnimated.View key={i} style={[styles.miniWaveBar, { backgroundColor: readerColors.accent, transform: [{ scaleY: anim }] }]} />
                    ))}
                  </View>
                  <View style={styles.miniInfo}>
                    <Text style={[styles.miniInfoLabel, { color: readerColors.accent }]} numberOfLines={1}>{t('reader.read')}</Text>
                    <View style={[styles.miniProgressTrack, { backgroundColor: readerColors.border }]}>
                      <View style={[styles.miniProgressFill, { backgroundColor: readerColors.accent, width: '38%' }]} />
                    </View>
                  </View>
                  <TouchableOpacity onPress={(e) => { e.stopPropagation(); toggleSpeech(); }} style={styles.miniCtrl} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <View style={styles.miniPause}>
                      <View style={[styles.miniPauseBar, { backgroundColor: readerColors.accent }]} />
                      <View style={[styles.miniPauseBar, { backgroundColor: readerColors.accent }]} />
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={(e) => { e.stopPropagation(); stopSpeech(); }} style={styles.miniCtrl} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <View style={[styles.miniStop, { backgroundColor: readerColors.iconBox }]} />
                  </TouchableOpacity>
                </TouchableOpacity>
              )}
              {isSpeechTimerPanelVisible ? (
                <View style={styles.timerPanel}>
                  <View style={styles.inlineTimerSliderWrap}>
                    <View style={styles.inlineTimerSliderLabels}>
                      <Text style={[styles.inlineTimerSliderLabel, { color: isDark ? '#aaaaaa' : '#666666' }]}>0m</Text>
                      <Text style={[styles.inlineTimerSliderValue, { color: textColor }]}>
                        {speechTimerMinutes === 0 ? t('reader.timerNone') : `${speechTimerMinutes}m`}
                      </Text>
                      <Text style={[styles.inlineTimerSliderLabel, { color: isDark ? '#aaaaaa' : '#666666' }]}>120m</Text>
                    </View>
                    <View style={styles.inlineTimerSliderTrackWrap}>
                      <View
                        style={styles.inlineTimerTouchArea}
                        onLayout={(event) => setSpeechTimerWidth(event.nativeEvent.layout.width)}
                        onStartShouldSetResponder={() => true}
                        onMoveShouldSetResponder={() => true}
                        onResponderGrant={(event) => updateSpeechTimerFromPosition(event.nativeEvent.locationX)}
                        onResponderMove={(event) => updateSpeechTimerFromPosition(event.nativeEvent.locationX)}
                      >
                        <View style={[styles.inlineTimerSliderTrack, { backgroundColor: isDark ? '#333333' : '#d9d9d9' }]} />
                        <View style={[styles.inlineTimerSliderTrackActive, { width: speechTimerThumbOffset, backgroundColor: '#1E88E5' }]} />
                        <View
                          style={[
                            styles.inlineTimerSliderThumb,
                            {
                              left: Math.max(0, speechTimerThumbOffset - 12),
                              backgroundColor: '#1E88E5',
                              borderColor: isDark ? '#121212' : '#ffffff',
                            },
                          ]}
                        />
                      </View>
                    </View>
                  </View>

                  <View style={styles.speechQuickSection}>
                    <View style={styles.speechQuickRow}>
                      <Text style={[styles.speechQuickLabel, { color: textColor }]}>
                        {t('settings.speechRate')}: {settings.speechRate.toFixed(1)}x
                      </Text>
                      <View style={styles.speechQuickControls}>
                        <TouchableOpacity
                          onPress={() => updateSettings({ speechRate: Math.max(0.5, Number((settings.speechRate - 0.1).toFixed(1))) })}
                          style={[styles.speechQuickButton, { backgroundColor: isDark ? '#2a2a2a' : '#f0f0f0' }]}
                        >
                          <Text style={[styles.speechQuickButtonText, { color: textColor }]}>-</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => updateSettings({ speechRate: Math.min(2.0, Number((settings.speechRate + 0.1).toFixed(1))) })}
                          style={[styles.speechQuickButton, { backgroundColor: isDark ? '#2a2a2a' : '#f0f0f0' }]}
                        >
                          <Text style={[styles.speechQuickButtonText, { color: textColor }]}>+</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={styles.speechQuickVoiceHeader}>
                      <Text style={[styles.speechQuickLabel, { color: textColor }]}>{t('settings.voice')}</Text>
                      <TouchableOpacity
                        onPress={() => setIsVoiceDropdownVisible((visible) => !visible)}
                        style={[styles.voiceDropdownTrigger, { borderColor: isDark ? '#3a3a3a' : '#d8d8d8', backgroundColor: isDark ? '#232323' : '#ffffff' }]}
                      >
                        <Text style={[styles.voiceDropdownTriggerText, { color: textColor }]} numberOfLines={1}>
                          {voicesLoading ? t('common.loading') : selectedVoiceLabel}
                        </Text>
                        <Ionicons
                          name={isVoiceDropdownVisible ? 'chevron-up' : 'chevron-down'}
                          size={16}
                          color={isDark ? '#9e9e9e' : '#666666'}
                        />
                      </TouchableOpacity>
                    </View>

                    {isVoiceDropdownVisible && (
                      <View style={[styles.voiceDropdownList, { borderColor: isDark ? '#3a3a3a' : '#d8d8d8', backgroundColor: isDark ? '#1b1b1b' : '#ffffff' }]}>
                        <ScrollView showsVerticalScrollIndicator={false} style={styles.voiceDropdownScroll}>
                          <TouchableOpacity
                            onPress={() => {
                              updateSettings({ voiceType: 'default' });
                              setIsVoiceDropdownVisible(false);
                              previewVoice('default', 'zh-CN');
                            }}
                            style={[
                              styles.voiceDropdownOption,
                              settings.voiceType === 'default' && [styles.speechVoiceChipActive, styles.voiceDropdownOptionActive],
                            ]}
                          >
                            <Text
                              style={[
                                styles.voiceDropdownOptionText,
                                { color: settings.voiceType === 'default' ? '#ffffff' : textColor },
                              ]}
                            >
                              {previewingVoiceId === 'default' ? t('common.loading') : t('common.default')}
                            </Text>
                          </TouchableOpacity>
                          {sortedVoices.slice(0, 40).map((voice) => {
                            const selected = settings.voiceType === voice.identifier;
                            const label = getVoiceDisplayLabel(voice, voice.identifier, t, language);
                            return (
                              <TouchableOpacity
                                key={voice.identifier}
                                onPress={() => {
                                  updateSettings({ voiceType: voice.identifier });
                                  setIsVoiceDropdownVisible(false);
                                  previewVoice(voice.identifier, voice.language);
                                }}
                                style={[
                                  styles.voiceDropdownOption,
                                  selected && [styles.speechVoiceChipActive, styles.voiceDropdownOptionActive],
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.voiceDropdownOptionText,
                                    { color: selected ? '#ffffff' : textColor },
                                  ]}
                                  numberOfLines={1}
                                >
                                  {previewingVoiceId === voice.identifier ? t('common.loading') : label}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      </View>
                    )}
                  </View>

                  <View style={styles.timerPanelActions}>
                    <TouchableOpacity onPress={isSpeaking ? stopSpeech : startSpeechWithTimer} style={styles.timerPanelActionButton}>
                      <Ionicons name={isSpeaking ? "pause-circle" : "play-circle"} size={36} color="#1E88E5" />
                    </TouchableOpacity>
                  </View>
                </View>
              ) : isTypographyPanelVisible ? (
                <View style={[styles.typoPanel, { backgroundColor: readerColors.bottomBar }]}>
                  {/* Handle */}
                  <View style={[styles.typoHandle, { backgroundColor: readerColors.border }]} />

                  {/* 字号 + 行距 并排 */}
                  <View style={styles.typoTopRow}>
                    <View style={[styles.typoCol, { backgroundColor: readerColors.surface }]}>
                      <Text style={[styles.typoColLabel, { color: readerColors.textSub }]}>字号</Text>
                      <View style={styles.typoStepperRow}>
                        <TouchableOpacity onPress={decreaseFontSize} style={[styles.typoStepBtn, { backgroundColor: readerColors.iconBox }]}>
                          <Text style={[styles.typoStepBtnText, { color: readerColors.accent }]}>−</Text>
                        </TouchableOpacity>
                        <Text style={[styles.typoStepVal, { color: readerColors.textPrimary }]}>{settings.fontSize}</Text>
                        <TouchableOpacity onPress={increaseFontSize} style={[styles.typoStepBtn, { backgroundColor: readerColors.iconBox }]}>
                          <Text style={[styles.typoStepBtnText, { color: readerColors.accent }]}>+</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={[styles.typoCol, { backgroundColor: readerColors.surface }]}>
                      <Text style={[styles.typoColLabel, { color: readerColors.textSub }]}>行距</Text>
                      <View style={styles.typoStepperRow}>
                        <TouchableOpacity onPress={decreaseLineSpacing} style={[styles.typoStepBtn, { backgroundColor: readerColors.iconBox }]}>
                          <Text style={[styles.typoStepBtnText, { color: readerColors.accent }]}>−</Text>
                        </TouchableOpacity>
                        <Text style={[styles.typoStepVal, { color: readerColors.textPrimary }]}>{settings.lineSpacing.toFixed(1)}</Text>
                        <TouchableOpacity onPress={increaseLineSpacing} style={[styles.typoStepBtn, { backgroundColor: readerColors.iconBox }]}>
                          <Text style={[styles.typoStepBtnText, { color: readerColors.accent }]}>+</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  {/* 字体芯片 */}
                  <Text style={[styles.typoChipsLabel, { color: readerColors.textSub }]}>字体</Text>
                  <View style={styles.typoChipsRow}>
                    {typographyFontOptions.map((option) => {
                      const selected = settings.fontPreset === option.id;
                      return (
                        <TouchableOpacity
                          key={option.id}
                          onPress={() => updateSettings({ fontPreset: option.id })}
                          style={[
                            styles.typoChip,
                            { backgroundColor: selected ? readerColors.accentBg : readerColors.surface },
                            selected && { borderWidth: 1, borderColor: readerColors.accentBorder },
                          ]}
                        >
                          <Text style={[styles.typoChipPreview, {
                            color: selected ? readerColors.accent : readerColors.textPrimary,
                            fontFamily: getFontFamilyForPreset(option.id),
                          }]}>汉</Text>
                          <Text style={[styles.typoChipName, { color: selected ? readerColors.accent : readerColors.textSub }]}>
                            {fontOptionMeta[option.id].label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* 完成 */}
                  <TouchableOpacity
                    onPress={() => setIsTypographyPanelVisible(false)}
                    style={[styles.typoDone, { backgroundColor: readerColors.surface }]}
                  >
                    <Text style={[styles.typoDoneText, { color: readerColors.accent }]}>{t('common.ok')}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.controlsRow}>
                  {/* 字体 */}
                  <TouchableOpacity onPress={toggleTypographyPanel} style={styles.ctrlBtn}>
                    <View style={[styles.ctrlIconBox,
                      { backgroundColor: isTypographyPanelVisible ? readerColors.accentBg : readerColors.iconBox },
                      isTypographyPanelVisible && { borderWidth: 1, borderColor: readerColors.accentBorder },
                    ]}>
                      <Text style={[styles.ctrlAaSmall, { color: isTypographyPanelVisible ? readerColors.accent : readerColors.textSub }]}>A</Text>
                      <Text style={[styles.ctrlAaLarge, { color: isTypographyPanelVisible ? readerColors.accent : readerColors.textSub }]}>A</Text>
                    </View>
                    <Text style={[styles.ctrlLabel, { color: isTypographyPanelVisible ? readerColors.accent : readerColors.textSub }]}>
                      {t('settings.fontSize')}
                    </Text>
                  </TouchableOpacity>

                  <View style={[styles.ctrlDivider, { backgroundColor: readerColors.border }]} />

                  {/* 主题 */}
                  <TouchableOpacity onPress={toggleTheme} style={styles.ctrlBtn}>
                    <View style={[styles.ctrlIconBox, { backgroundColor: readerColors.iconBox }]}>
                      <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={20} color={readerColors.textSub} />
                    </View>
                    <Text style={[styles.ctrlLabel, { color: readerColors.textSub }]}>{t('reader.theme')}</Text>
                  </TouchableOpacity>

                  <View style={[styles.ctrlDivider, { backgroundColor: readerColors.border }]} />

                  {/* 自动翻页 */}
                  <TouchableOpacity onPress={() => updateSettings({ autoFlip: !settings.autoFlip })} style={styles.ctrlBtn}>
                    <View style={[styles.ctrlIconBox, { backgroundColor: readerColors.iconBox }]}>
                      <Ionicons
                        name={settings.autoFlip ? 'stop-circle-outline' : 'play-circle-outline'}
                        size={20}
                        color={settings.autoFlip ? '#D64040' : readerColors.textSub}
                      />
                    </View>
                    <Text style={[styles.ctrlLabel, { color: settings.autoFlip ? '#D64040' : readerColors.textSub }]}>
                      {settings.autoFlip ? t('reader.autoFlipStop') : t('reader.autoFlipStart')}
                    </Text>
                  </TouchableOpacity>

                  <View style={[styles.ctrlDivider, { backgroundColor: readerColors.border }]} />

                  {/* 朗读 */}
                  <TouchableOpacity onPress={toggleSpeech} style={styles.ctrlBtn}>
                    <View style={[styles.ctrlIconBox,
                      { backgroundColor: isSpeaking ? readerColors.accentBg : readerColors.iconBox },
                      isSpeaking && { borderWidth: 1, borderColor: readerColors.accentBorder },
                    ]}>
                      <Ionicons name={isSpeaking ? 'mic' : 'mic-outline'} size={20} color={isSpeaking ? readerColors.accent : readerColors.textSub} />
                    </View>
                    <Text style={[styles.ctrlLabel, { color: isSpeaking ? readerColors.accent : readerColors.textSub }]}>
                      {isSpeaking ? t('reader.pause') : t('reader.read')}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
          </View>
      )}

      {/* 全屏朗读 Modal */}
      <Modal
        visible={isTtsOverlayVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsTtsOverlayVisible(false)}
        statusBarTranslucent
      >
        <View style={[styles.ttsOverlay, { backgroundColor: isDark ? 'rgba(8,6,4,0.96)' : 'rgba(248,244,236,0.97)' }]}>
          {/* 返回按钮 */}
          <TouchableOpacity
            onPress={() => setIsTtsOverlayVisible(false)}
            style={[styles.ttsBack, { backgroundColor: readerColors.iconBox, top: insets.top + 14 }]}
          >
            <Ionicons name="chevron-down" size={20} color={readerColors.accent} />
          </TouchableOpacity>

          {/* 大音波 */}
          <View style={styles.ttsBigWave}>
            {waveAnims.map((anim, i) => (
              <RNAnimated.View
                key={i}
                style={[styles.ttsBigWaveBar, {
                  backgroundColor: readerColors.accent,
                  transform: [{ scaleY: anim }],
                }]}
              />
            ))}
          </View>

          {/* 章节标题 */}
          <Text style={[styles.ttsChapterTitle, { color: readerColors.accent }]} numberOfLines={1}>
            {currentHeaderTitle || book?.title}
          </Text>

          {/* 当前句子 */}
          <Text style={[styles.ttsSentence, { color: readerColors.textPrimary }]} numberOfLines={3}>
            {(() => {
              const chData = chaptersData.find(c => c.chapter.id === currentSpeakingChapterId);
              return chData?.sentences[currentSentenceIndex]?.text ?? '';
            })()}
          </Text>

          {/* 进度条 */}
          <View style={[styles.ttsTrack, { backgroundColor: readerColors.border }]}>
            <View style={[styles.ttsTrackFill, { backgroundColor: readerColors.accent, width: '45%' }]} />
            <View style={[styles.ttsTrackDot, { backgroundColor: readerColors.accent, left: '43%' }]} />
          </View>

          {/* 三键控制 */}
          <View style={styles.ttsControls}>
            <TouchableOpacity
              style={[styles.ttsSmBtn, { backgroundColor: readerColors.iconBox }]}
              onPress={() => {
                const chData = chaptersData.find(c => c.chapter.id === currentSpeakingChapterId);
                if (chData && currentSentenceIndex > 0) {
                  speakSentence(chData.chapter.id, currentSentenceIndex - 1);
                }
              }}
            >
              <Ionicons name="play-skip-back" size={18} color={readerColors.accent} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.ttsMainBtn, { backgroundColor: readerColors.accent }]}
              onPress={toggleSpeech}
            >
              <Ionicons
                name={isSpeaking ? 'pause' : 'play'}
                size={26}
                color={isDark ? '#0E0C0A' : '#FAF7F0'}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.ttsSmBtn, { backgroundColor: readerColors.iconBox }]}
              onPress={() => {
                const chData = chaptersData.find(c => c.chapter.id === currentSpeakingChapterId);
                if (chData && currentSentenceIndex < chData.sentences.length - 1) {
                  speakSentence(chData.chapter.id, currentSentenceIndex + 1);
                }
              }}
            >
              <Ionicons name="play-skip-forward" size={18} color={readerColors.accent} />
            </TouchableOpacity>
          </View>

          {/* 功能芯片 */}
          <View style={styles.ttsChips}>
            <TouchableOpacity
              style={[styles.ttsChip, { backgroundColor: readerColors.accentBg, borderWidth: 1, borderColor: readerColors.accentBorder }]}
              onPress={() => updateSettings({ speechRate: settings.speechRate >= 2.0 ? 0.5 : Number((settings.speechRate + 0.25).toFixed(2)) })}
            >
              <Text style={[styles.ttsChipText, { color: readerColors.accent }]}>{settings.speechRate.toFixed(1)}x</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.ttsChip, { backgroundColor: readerColors.iconBox }]}
              onPress={() => {}}
            >
              <Text style={[styles.ttsChipText, { color: readerColors.textSub }]} numberOfLines={1}>
                {selectedVoiceLabel}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.ttsChip, { backgroundColor: readerColors.iconBox }]}
              onPress={() => {
                const options = [15, 30, 60, 0];
                const next = options[(options.indexOf(speechTimerMinutes) + 1) % options.length];
                setSpeechTimerMinutes(next);
                setIsSpeechTimerEnabled(next > 0);
              }}
            >
              <Text style={[styles.ttsChipText, { color: readerColors.textSub }]}>
                {speechTimerMinutes > 0 ? `⏱ ${speechTimerMinutes}m` : t('reader.timerNone')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
      alignItems: 'center',
      justifyContent: 'center',
  },
  header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingBottom: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: '#ccc',
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10,
  },
  headerTitle: {
      flex: 1,
      fontSize: 18,
      fontWeight: 'bold',
      textAlign: 'center',
      marginHorizontal: 10,
  },
  iconButton: {
      padding: 8,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chapterContainer: {
    marginBottom: 40,
  },
  chapterTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    marginTop: 10,
  },
  content: {
      textAlign: 'justify',
      ...(Platform.OS === 'web' ? ({ userSelect: 'text', cursor: 'text' } as any) : null),
  },
  chapterDivider: {
    height: 1,
    backgroundColor: '#eee',
    marginTop: 40,
  },
  pageContainer: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'flex-start',
  },
  pageContent: {
    textAlign: 'justify',
    overflow: 'hidden',
  },
  highlightedSentence: {
    borderRadius: 4,
  },
  pageIndicator: {
    marginTop: 12,
    fontSize: 12,
    textAlign: 'right',
  },
  pageIndicatorOverlay: {
    position: 'absolute',
    right: 20,
    bottom: 12,
  },
  footer: {
      paddingTop: 10,
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
  },
  timerPanel: {
      paddingHorizontal: 18,
      paddingTop: 4,
  },
  inlineTimerSliderWrap: {
      marginTop: 4,
  },
  inlineTimerSliderLabels: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
  },
  inlineTimerSliderLabel: {
      fontSize: 12,
  },
  inlineTimerSliderValue: {
      fontSize: 18,
      fontWeight: '700',
  },
  inlineTimerSliderTrackWrap: {
      height: 24,
      justifyContent: 'center',
      position: 'relative',
  },
  inlineTimerTouchArea: {
      width: '100%',
      height: 24,
      justifyContent: 'center',
  },
  inlineTimerSliderTrack: {
      height: 6,
      borderRadius: 999,
      width: '100%',
  },
  inlineTimerSliderTrackActive: {
      position: 'absolute',
      left: 0,
      height: 6,
      borderRadius: 999,
  },
  inlineTimerSliderThumb: {
      position: 'absolute',
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 3,
      top: 0,
  },
  timerPanelActions: {
      flexDirection: 'row',
      justifyContent: 'center',
      marginTop: 12,
  },
  speechQuickSection: {
      marginTop: 16,
      gap: 12,
  },
  typographyPanelSection: {
      marginTop: 4,
      gap: 12,
  },
  typographyTwoColumnRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: 10,
  },
  typographyColumn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
  },
  typographyIconRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 14,
  },
  typographyIconButton: {
      paddingVertical: 6,
      paddingHorizontal: 4,
  },
  spacingIconCompact: {
      width: 22,
      height: 22,
      justifyContent: 'center',
      gap: 2,
  },
  spacingIconExpanded: {
      width: 22,
      height: 22,
      justifyContent: 'center',
      gap: 6,
  },
  spacingIconLine: {
      height: 2,
      borderRadius: 999,
      width: '100%',
  },
  typographyColumnDivider: {
      width: StyleSheet.hairlineWidth,
  },
  typographyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
  },
  typographyLabel: {
      fontSize: 14,
      fontWeight: '600',
  },
  typographyFontsInlineRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
  },
  typographyFontChip: {
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
      minWidth: 68,
      alignItems: 'center',
      justifyContent: 'center',
  },
  typographyFontChipText: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '500',
      includeFontPadding: false,
  },
  speechQuickRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
  },
  speechQuickLabel: {
      fontSize: 14,
      fontWeight: '600',
  },
  speechQuickControls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
  },
  speechQuickButton: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
  },
  speechQuickButtonText: {
      fontSize: 18,
      fontWeight: '700',
  },
  speechQuickVoiceHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
  },
  speechQuickVoiceValue: {
      flex: 1,
      textAlign: 'right',
      fontSize: 12,
  },
  voiceDropdownTrigger: {
      flex: 1,
      marginLeft: 12,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
  },
  voiceDropdownTriggerText: {
      flex: 1,
      fontSize: 12,
      textAlign: 'right',
  },
  voiceDropdownList: {
      borderWidth: 1,
      borderRadius: 12,
      maxHeight: 220,
      overflow: 'hidden',
  },
  voiceDropdownScroll: {
      maxHeight: 220,
  },
  voiceDropdownOption: {
      paddingHorizontal: 12,
      paddingVertical: 10,
  },
  voiceDropdownOptionActive: {
      borderRadius: 0,
  },
  voiceDropdownOptionText: {
      fontSize: 13,
  },
  speechVoiceList: {
      paddingVertical: 2,
      paddingRight: 12,
      gap: 8,
  },
  speechVoiceChip: {
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
      maxWidth: 150,
  },
  speechVoiceChipActive: {
      backgroundColor: '#1E88E5',
      borderColor: '#1E88E5',
  },
  speechVoiceChipText: {
      fontSize: 12,
      fontWeight: '500',
  },
  timerPanelActionButton: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      alignItems: 'center',
      justifyContent: 'center',
  },
  timerPanelActionText: {
      fontSize: 15,
      fontWeight: '600',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  ctrlBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
  },
  ctrlIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 1,
  },
  ctrlAaSmall: {
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 16,
  },
  ctrlAaLarge: {
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 24,
  },
  ctrlLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  ctrlDivider: {
    width: 1,
    height: 28,
  },
  typoPanel: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
  },
  typoHandle: {
    width: 28,
    height: 3,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 14,
  },
  typoTopRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  typoCol: {
    flex: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  typoColLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  typoStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  typoStepBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typoStepBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
  typoStepVal: {
    fontSize: 16,
    fontWeight: '800',
    minWidth: 28,
    textAlign: 'center',
  },
  typoChipsLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  typoChipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  typoChip: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
    gap: 4,
  },
  typoChipPreview: {
    fontSize: 16,
    fontWeight: '600',
  },
  typoChipName: {
    fontSize: 9,
    fontWeight: '700',
  },
  typoDone: {
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },
  typoDoneText: {
    fontSize: 13,
    fontWeight: '700',
  },
  miniPlayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    zIndex: 20,
  },
  miniPlayerInFooter: {
    position: 'relative',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    margin: 10,
    marginBottom: 4,
    height: 48,
  },
  miniWave: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 20,
  },
  miniWaveBar: {
    width: 2.5,
    height: 16,
    borderRadius: 2,
  },
  miniInfo: {
    flex: 1,
    gap: 4,
  },
  miniInfoLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  miniProgressTrack: {
    height: 2,
    borderRadius: 1,
  },
  miniProgressFill: {
    height: 2,
    borderRadius: 1,
  },
  miniCtrl: {
    padding: 2,
  },
  miniPause: {
    flexDirection: 'row',
    gap: 2,
    alignItems: 'center',
  },
  miniPauseBar: {
    width: 2.5,
    height: 12,
    borderRadius: 1,
  },
  miniStop: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  ttsOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  ttsBack: {
    position: 'absolute',
    left: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ttsBigWave: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 60,
    marginBottom: 24,
  },
  ttsBigWaveBar: {
    width: 4,
    height: 52,
    borderRadius: 3,
  },
  ttsChapterTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 10,
    textAlign: 'center',
  },
  ttsSentence: {
    fontSize: 16,
    lineHeight: 26,
    textAlign: 'center',
    marginBottom: 28,
  },
  ttsTrack: {
    width: '100%',
    height: 2,
    borderRadius: 1,
    marginBottom: 28,
    position: 'relative',
  },
  ttsTrackFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: 2,
    borderRadius: 1,
  },
  ttsTrackDot: {
    position: 'absolute',
    top: -5,
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  ttsControls: {
    flexDirection: 'row',
    gap: 20,
    alignItems: 'center',
    marginBottom: 32,
  },
  ttsSmBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ttsMainBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  ttsChips: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  ttsChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  ttsChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
