import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, Dimensions, TouchableOpacity, ActivityIndicator, StatusBar, Platform, PermissionsAndroid, ViewToken, useColorScheme, FlatListProps, AppState, Modal, Animated as RNAnimated } from 'react-native';
import Animated, { useAnimatedRef, useSharedValue, scrollTo, useFrameCallback, useAnimatedScrollHandler, runOnJS } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import nowPlaying from '../utils/nowPlaying';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import BookService from '../services/BookService';
import ChapterService from '../services/ChapterService';
import StorageService from '../services/StorageService';
import { STORAGE_KEYS } from '../utils/constants';
import { Book, Chapter, ReadingProgress, RichTextBlock } from '../types';
import { parseSentences, ParsedSentence, prepareSentenceForTts, normalizeDisplayParagraphSpacing, estimateCharWidthFactor } from '../utils/textUtils';
import { splitChapterIntoPages } from '../utils/paginationUtils';
import { FONT_PRESET_OPTIONS, getFontFamilyForPreset } from '../utils/fontUtils';
import { getChapterRelativePageIndex, getChapterRelativePageIndexFromGlobalIndex } from '../utils/readingProgress';
import { VoiceEntry, mergeWithInstalledVoices, prependXfyunVoices, isXfyunVoice } from '../utils/voiceUtils';
import { VoicePickerModal } from '../components/VoicePickerModal';
import { promptThenOpenSystemSettings } from '../utils/systemSettings';
import useSettings from '../hooks/useSettings';
import useTts from '../hooks/useTts';
import { LocalTtsProvider } from '../services/tts/LocalTtsProvider';
import { XfyunTtsProvider } from '../services/tts/XfyunTtsProvider';
import useI18n from '../i18n';
import { TranslationKey } from '../i18n/translations';
import { useFocusEffect } from '@react-navigation/native';
import AdBanner, { AD_BANNER_HEIGHT } from '../components/AdBanner';
import { useCloudVoiceAccess } from '../hooks/useCloudVoiceAccess';
import EpubBlock from '../components/EpubBlock';
import AdService from '../services/AdService';

async function ensurePostNotificationsPermission(): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (Platform.Version < 33) return;
  try {
    const granted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    if (granted) return;
    await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
  } catch (e) {
    console.warn('[ReaderScreen] POST_NOTIFICATIONS request error:', e);
  }
}

interface ChapterData {
  chapter: Chapter;
  content: string;
  sentences: ParsedSentence[];
  blocks?: RichTextBlock[];
}

interface PageData {
  id: string;
  chapter: Chapter;
  content: string;
  pageNumber: number;
  pageCount: number;
  charStart: number; // offset in normalized chapter content
  blocks?: RichTextBlock[];
}

interface HighlightFragment {
  text: string;
  highlighted: boolean;
}

const VERTICAL_CONTENT_PADDING_TOP = 40; // contentContainerStyle.paddingVertical
const CHAPTER_MARGIN_BOTTOM = 40; // styles.chapterContainer.marginBottom
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


function getHighlightedFragments(
  content: string,
  sentence: ParsedSentence | null
): HighlightFragment[] {
  if (!sentence) {
    return [{ text: content, highlighted: false }];
  }

  const before = content.slice(0, sentence.start);
  const raw = content.slice(sentence.start, sentence.end);
  const trimmed = raw.replace(/[\s\n\r]+$/, '');
  const current = trimmed;
  const after = raw.slice(trimmed.length) + content.slice(sentence.end);

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
  const raw = pageContent.slice(index, index + sentenceText.length);
  const trimmed = raw.replace(/[\s\n\r]+$/, '');
  const current = trimmed;
  const after = raw.slice(trimmed.length) + pageContent.slice(index + sentenceText.length);

  return [
    { text: before, highlighted: false },
    { text: current, highlighted: true },
    { text: after, highlighted: false },
  ].filter((fragment) => fragment.text.length > 0);
}

function getBlocksForPage(
  blocks: RichTextBlock[],
  pageCharStart: number,
  pageContent: string
): RichTextBlock[] {
  const pageEnd = pageCharStart + pageContent.length;
  return blocks
    .filter(b => b.flatStart < pageEnd && b.flatEnd > pageCharStart)
    .map(b => ({
      ...b,
      text: b.text.substring(
        Math.max(0, pageCharStart - b.flatStart),
        Math.min(b.text.length, pageEnd - b.flatStart)
      ),
      flatStart: Math.max(b.flatStart, pageCharStart) - pageCharStart,
      flatEnd: Math.min(b.flatEnd, pageEnd) - pageCharStart,
    }));
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
      {item.blocks ? (
        item.blocks.map((block, idx) => {
          const hasOverlap = activeSentence
            ? activeSentence.start < block.flatEnd && activeSentence.end > block.flatStart
            : false;
          const sentHighlight = hasOverlap && activeSentence
            ? {
                start: Math.max(0, activeSentence.start - block.flatStart),
                end: Math.min(block.text.length, activeSentence.end - block.flatStart),
              }
            : undefined;
          return (
            <EpubBlock
              key={`${item.chapter.id}_block_${idx}`}
              block={block}
              fontSize={fontSize}
              lineHeight={lineHeight}
              textColor={textColor}
              fontFamily={fontFamily}
              isDark={isDark}
              highlightRange={sentHighlight}
            />
          );
        })
      ) : isSpeaking ? (
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
  activeSentence: ParsedSentence | null;
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
  activeSentence,
}: ReaderPageItemProps) => {
  const fragments = useMemo(() => activeSentence
    ? getPageHighlightedFragments(item.content, activeSentence.text)
    : [{ text: item.content, highlighted: false }], [item.content, activeSentence]);

  return (
    <View style={[styles.pageContainer, { width: windowWidth, paddingTop: topPadding, paddingBottom: bottomPadding }]}>
      {item.pageNumber === 1 ? (
        <Text style={[styles.chapterTitle, { color: textColor }]} numberOfLines={1}>
          {item.chapter.title}
        </Text>
      ) : null}
      {item.blocks ? (
        item.blocks.map((block, idx) => {
          const pageRelStart = activeSentence ? activeSentence.start - item.charStart : -1;
          const pageRelEnd = activeSentence ? activeSentence.end - item.charStart : -1;
          const hasOverlap = activeSentence
            ? pageRelStart < block.flatEnd && pageRelEnd > block.flatStart
            : false;
          const sentHighlight = hasOverlap ? {
            start: Math.max(0, pageRelStart - block.flatStart),
            end: Math.min(block.text.length, pageRelEnd - block.flatStart),
          } : undefined;
          return (
            <EpubBlock
              key={`${item.id}_block_${idx}`}
              block={block}
              fontSize={fontSize}
              lineHeight={lineHeight}
              textColor={textColor}
              fontFamily={fontFamily}
              isDark={isDark}
              highlightRange={sentHighlight}
            />
          );
        })
      ) : (
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
      )}
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
  (() => {
    const ps = prev.activeSentence;
    const ns = next.activeSentence;
    return ps === ns || (ps?.start === ns?.start && ps?.end === ns?.end && ps?.text === ns?.text);
  })()
));

export default function ReaderScreen({ route, navigation }: any) {
  const { bookId, chapterId } = route.params;
  const insets = useSafeAreaInsets();

  const [book, setBook] = useState<Book | null>(null);
  const [allChapters, setAllChapters] = useState<Chapter[]>([]);

  // Data for FlatList
  const [chaptersData, setChaptersData] = useState<ChapterData[]>([]);
  const chaptersDataRef = useRef<ChapterData[]>([]);
  chaptersDataRef.current = chaptersData;
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
  const [showAd, setShowAd] = useState(false);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);


  // Speech state
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isTtsFallback, setIsTtsFallback] = useState(false);
  const isSpeakingRef = useRef(false);
  const startSpeechRef = useRef<() => void>(() => { });
  const stopSpeechRef = useRef<() => void>(() => { });
  const pauseSpeechRef = useRef<() => void>(() => { });
  const resumeSpeechRef = useRef<() => void>(() => { });
  const speakSentenceRef = useRef<(cId: string, sIdx: number) => void>(() => { });
  const prevVoiceTypeRef = useRef<string>('');
  const pausedPositionRef = useRef<{ chapterId: string; sentenceIndex: number } | null>(null);
  const wasPlayingBeforeInterruptionRef = useRef(false);
  const handleRemoteSkipRef = useRef<(delta: 1 | -1) => void>(() => {});
  const [currentSpeakingChapterId, setCurrentSpeakingChapterId] = useState<string | null>(null);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
  const [selectedSentence, setSelectedSentence] = useState<{ chapterId: string; sentenceIndex: number } | null>(null);

  // Timer
  const [isTypographyPanelVisible, setIsTypographyPanelVisible] = useState(false);
  const [isTtsOverlayVisible, setIsTtsOverlayVisible] = useState(false);
  const waveAnims = useRef(
    Array.from({ length: 7 }, (_, i) => new RNAnimated.Value(0.3 + i * 0.1))
  ).current;
  const [isSpeechTimerEnabled, setIsSpeechTimerEnabled] = useState(false);
  const [speechTimerMinutes, setSpeechTimerMinutes] = useState(0);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voices, setVoices] = useState<VoiceEntry[]>([]);
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);
  const [isVoiceDropdownVisible, setIsVoiceDropdownVisible] = useState(false);
  const [isTtsVoicePickerVisible, setIsTtsVoicePickerVisible] = useState(false);
  const speechTimerRef = useRef<NodeJS.Timeout | null>(null);
  const timerEndRef = useRef<number | null>(null);
  const speakSessionRef = useRef(0);

  const { settings, updateSettings } = useSettings();
  const { requestAccess } = useCloudVoiceAccess();
  const tts = useTts(settings.voiceType, settings.backupVoice ?? 'default');
  const previewProviderRef = useRef<LocalTtsProvider | XfyunTtsProvider | null>(null);
  const { t, language } = useI18n();

  const [debouncedFontSize, setDebouncedFontSize] = useState(settings.fontSize);
  const [debouncedLineSpacing, setDebouncedLineSpacing] = useState(settings.lineSpacing);
  const fontDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flatListRef = useAnimatedRef<Animated.FlatList<ChapterData | PageData>>();
  const chapterLayoutsRef = useRef<Record<string, { y: number; height: number }>>({});
  const prevSpeakingChapterIdRef = useRef<string | null>(null);
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
  const triggerProgressCheckRef = useRef<() => void>(() => { });
  const isPreloadingRef = useRef(false);
  const backLoadFailedRef = useRef(false);
  const suppressStartReachedRef = useRef(false);
  const handleOverscrollBackLoadRef = useRef<() => Promise<void>>(async () => { });

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
  const saveCurrentProgressRef = useRef<() => void>(() => { });


  const voicesCancelledRef = useRef(false);
  const loadVoices = useCallback(async () => {
    setVoicesLoading(true);
    try {
      const available = await Speech.getAvailableVoicesAsync();
      if (voicesCancelledRef.current) return;

      const raw = (available || []).map((v: any) => ({
        identifier: String(v.identifier),
        name: typeof v.name === 'string' ? v.name : undefined,
        language: typeof v.language === 'string' ? v.language : undefined,
        quality: typeof v.quality === 'string' ? v.quality : undefined,
      }));

      if (Platform.OS === 'ios') {
        const zhInstalled = raw.filter(v => {
          const lang = (v.language || '').toLowerCase();
          return lang.startsWith('zh') || lang.startsWith('en');
        });
        setVoices(mergeWithInstalledVoices(zhInstalled));
      } else {
        const normalized = raw
          .filter(v => {
            if (!v.identifier) return false;
            const lang = (v.language || '').toLowerCase();
            if (!(lang.startsWith('zh') || lang.startsWith('en'))) return false;
            if (v.name && EXCLUDED_VOICE_NAMES.has(v.name)) return false;
            return true;
          })
          .map(v => ({
            identifier: v.identifier,
            name: v.name || v.identifier,
            language: v.language || '',
            quality: (v.quality === 'Premium' ? 'Premium' : v.quality === 'Enhanced' ? 'Enhanced' : 'Default') as 'Default' | 'Enhanced' | 'Premium',
            installed: true,
          }));
        setVoices(prependXfyunVoices(normalized));
      }
    } finally {
      if (!voicesCancelledRef.current) setVoicesLoading(false);
    }
  }, []);

  useEffect(() => {
    voicesCancelledRef.current = false;
    loadVoices();
    return () => { voicesCancelledRef.current = true; };
  }, [loadVoices]);

  const scheduleBannerReshowTimer = useCallback((cancelled: { value: boolean }) => {
    AdService.getBannerReshowDelayMs().then(delay => {
      if (cancelled.value || delay <= 0) return;
      clearTimeout(bannerTimerRef.current);
      bannerTimerRef.current = setTimeout(() => {
        AdService.shouldShowBanner().then(setShowAd);
      }, delay + 500);
    });
  }, []);

  const handleBannerHidden = useCallback(() => {
    setShowAd(false);
    const cancelled = { value: false };
    scheduleBannerReshowTimer(cancelled);
  }, [scheduleBannerReshowTimer]);

  useEffect(() => {
    const cancelled = { value: false };
    AdService.shouldShowBanner().then(v => {
      if (cancelled.value) return;
      setShowAd(v);
      if (!v) scheduleBannerReshowTimer(cancelled);
    });
    return () => { cancelled.value = true; clearTimeout(bannerTimerRef.current); };
  }, [scheduleBannerReshowTimer]);

  useFocusEffect(
    useCallback(() => {
      const cancelled = { value: false };
      AdService.shouldShowBanner().then(v => {
        if (cancelled.value) return;
        setShowAd(v);
        if (!v) scheduleBannerReshowTimer(cancelled);
      });
      return () => { cancelled.value = true; };
    }, [scheduleBannerReshowTimer])
  );

  const openVoiceSettings = useCallback(() => {
    promptThenOpenSystemSettings(t('settings.voiceHintIos'), t('common.cancel'), t('common.ok'));
  }, [t]);

  useEffect(() => {
    clearTimeout(fontDebounceRef.current);
    fontDebounceRef.current = setTimeout(() => {
      React.startTransition(() => {
        setDebouncedFontSize(settings.fontSize);
        setDebouncedLineSpacing(settings.lineSpacing);
      });
    }, 300);
    return () => clearTimeout(fontDebounceRef.current);
  }, [settings.fontSize, settings.lineSpacing]);

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
    if (loading) return;
    if (!pendingRestoreRef.current) {
      suppressStartReachedRef.current = false;
      return;
    }
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
      suppressStartReachedRef.current = false;
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
      console.log('[TTS-AUTOSCROLL] sentenceText:', sentenceText?.slice(0, 30), 'pageIndex:', pageIndex, 'currentScrollPage:', Math.round(scrollPos.value / Math.max(window.width, 1)));
      if (pageIndex !== -1) {
        flatListRef.current?.scrollToIndex({ index: pageIndex, animated: true });
      }
    } else {
      const chLayout = chapterLayoutsRef.current[currentSpeakingChapterId];
      if (!chLayout) {
        prevSpeakingChapterIdRef.current = currentSpeakingChapterId;
        const chapterIndex = chaptersData.findIndex((c) => c.chapter.id === currentSpeakingChapterId);
        if (chapterIndex !== -1) {
          flatListRef.current?.scrollToIndex({ index: chapterIndex, animated: true, viewPosition: 0.5 });
        }
        return;
      }
      const chData = chaptersData.find((c) => c.chapter.id === currentSpeakingChapterId);
      if (!chData) return;
      const sentence = chData.sentences[currentSentenceIndex];
      if (!sentence) return;

      const chapterIndex = chaptersData.findIndex((c) => c.chapter.id === currentSpeakingChapterId);
      let absoluteChapterY = VERTICAL_CONTENT_PADDING_TOP;
      for (let i = 0; i < chapterIndex; i++) {
        const prevLayout = chapterLayoutsRef.current[chaptersData[i].chapter.id];
        if (prevLayout) absoluteChapterY += prevLayout.height + CHAPTER_MARGIN_BOTTOM;
      }
      const ratio = sentence.start / Math.max(1, chData.content.length);
      const estimatedY = absoluteChapterY + ratio * chLayout.height;
      const screenHeight = window.height;

      prevSpeakingChapterIdRef.current = currentSpeakingChapterId;

      const targetOffset = Math.max(0, estimatedY - screenHeight * 0.4);
      // Only scroll forward (don't jump back above current reading position)
      if (targetOffset <= scrollPos.value) return;
      if (isAutoScrolling.value) {
        autoScrollOffset.value = targetOffset;
      }
      flatListRef.current?.scrollToOffset({
        offset: targetOffset,
        animated: true,
      });
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
      loadingPrevRef.current = false;
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
        let content: string;
        let blocks: RichTextBlock[] | undefined;
        if (currentBook.fileType === 'epub' && ch.htmlFilePath) {
          blocks = await ChapterService.getChapterBlocks(ch.htmlFilePath);
          content = blocks.map(b => b.text).join('');
        } else {
          content = await ChapterService.getChapterContent(currentBook.filePath, ch.startPosition, ch.endPosition);
        }
        const sentences = parseSentences(content);
        newData.push({
          chapter: ch,
          content,
          sentences,
          blocks,
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
      let content: string;
      let blocks: RichTextBlock[] | undefined;
      if (book.fileType === 'epub' && ch.htmlFilePath) {
        blocks = await ChapterService.getChapterBlocks(ch.htmlFilePath);
        content = blocks.map(b => b.text).join('');
      } else {
        content = await ChapterService.getChapterContent(book.filePath, ch.startPosition, ch.endPosition);
      }
      const sentences = parseSentences(content);
      setChaptersData(prev => [{ chapter: ch, content, sentences, blocks }, ...prev]);
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
      let content: string;
      let blocks: RichTextBlock[] | undefined;
      if (book.fileType === 'epub' && ch.htmlFilePath) {
        blocks = await ChapterService.getChapterBlocks(ch.htmlFilePath);
        content = blocks.map(b => b.text).join('');
      } else {
        content = await ChapterService.getChapterContent(book.filePath, ch.startPosition, ch.endPosition);
      }
      const sentences = parseSentences(content);
      setChaptersData(prev => [{ chapter: ch, content, sentences, blocks }, ...prev]);
      setChapterWindow(prev => ({ ...prev, prevId: ch.id, isBackLoading: false }));

      if (settings.flipMode === 'scroll') {
        setTimeout(() => {
          const layout = chapterLayoutsRef.current[ch.id];
          const absY = getChapterAbsoluteY(ch.id);
          if (layout && absY !== null) {
            const target = Math.max(0, absY + layout.height - window.height * 0.8);
            flatListRef.current?.scrollToOffset({
              offset: target,
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

  const handleStartReachedRef = useRef<() => Promise<void>>(async () => { });
  handleStartReachedRef.current = handleStartReached;
  handleOverscrollBackLoadRef.current = handleOverscrollBackLoad;

  // FlatList row 上 onLayout 报告的 y 始终是 0（row 内位置），不能用于章节绝对偏移。
  // 通过累加前面章节的 height + margin 计算章节在 contentContainer 中的绝对 y。
  const getChapterAbsoluteY = (chapterId: string): number | null => {
    const data = chaptersDataRef.current;
    const idx = data.findIndex(c => c.chapter.id === chapterId);
    if (idx === -1) return null;
    let y = VERTICAL_CONTENT_PADDING_TOP;
    for (let i = 0; i < idx; i++) {
      const l = chapterLayoutsRef.current[data[i].chapter.id];
      if (!l) return null;
      y += l.height + CHAPTER_MARGIN_BOTTOM;
    }
    return y;
  };

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
      const absY = getChapterAbsoluteY(currentId);
      if (absY === null) return 0;
      return Math.min(1, Math.max(0, (scrollPos.value - absY) / layout.height));
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
          let content: string;
          let blocks: RichTextBlock[] | undefined;
          if (book.fileType === 'epub' && nextChapter.htmlFilePath) {
            blocks = await ChapterService.getChapterBlocks(nextChapter.htmlFilePath);
            content = blocks.map(b => b.text).join('');
          } else {
            content = await ChapterService.getChapterContent(book.filePath, nextChapter.startPosition, nextChapter.endPosition);
          }
          const sentences = parseSentences(content);
          setChaptersData(prev => [...prev, { chapter: nextChapter, content, sentences, blocks }]);
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
        savedPage = getChapterRelativePageIndex(horizontalPages, visibleItem.id);
      } else {
        const pageIndex = Math.round(scrollPos.value / Math.max(window.width, 1));
        savedPage = getChapterRelativePageIndexFromGlobalIndex(horizontalPages, pageIndex, cId);
      }
    }
    const currentOffset = isAutoScrolling.value ? autoScrollOffset.value : scrollPos.value;
    let chapterRelativeOffset = 0;
    if (!isHoriz) {
      const chapterIndex = chaptersDataRef.current.findIndex(c => c.chapter.id === cId);
      if (chapterIndex !== -1) {
        let absoluteChapterY = VERTICAL_CONTENT_PADDING_TOP;
        for (let i = 0; i < chapterIndex; i++) {
          const prevLayout = chapterLayoutsRef.current[chaptersDataRef.current[i].chapter.id];
          if (prevLayout) absoluteChapterY += prevLayout.height + CHAPTER_MARGIN_BOTTOM;
        }
        chapterRelativeOffset = Math.max(0, Math.round(currentOffset) - (absoluteChapterY - VERTICAL_CONTENT_PADDING_TOP));
      }
    }
    const progress: ReadingProgress = {
      id: `progress_${bookId}`,
      bookId,
      chapterId: cId,
      currentPosition: isHoriz ? 0 : chapterRelativeOffset,
      currentPage: savedPage,
      readingMode: settings.flipMode,
      updatedAt: new Date().toISOString()
    };
    await StorageService.storeData(`${STORAGE_KEYS.READING_PROGRESS_PREFIX}${bookId}`, progress);
  };

  // Speech Logic
  const toggleSpeech = () => {
    console.log('Toggling speech. Currently speaking:', isSpeaking);
    if (isSpeaking) {
      pauseSpeechRef.current();
    } else {
      setIsTypographyPanelVisible(false);
      startSpeechRef.current();
    }
  };

  const toggleTypographyPanel = () => {
    setIsVoiceDropdownVisible(false);
    setIsTypographyPanelVisible((visible) => !visible);
  };

  const computeTimerEndMs = (minutes: number) =>
    Date.now() + minutes * 60 * 1000 * (__DEV__ ? 0.1 : 1);

  const startSpeech = async (duration: number | null = null, hidePanel: boolean = true) => {
    speakSessionRef.current++;
    console.log('Starting speech with duration:', duration);
    setIsSpeaking(true);
    isSpeakingRef.current = true;
    setIsTtsFallback(false);

    timerEndRef.current = duration !== null ? computeTimerEndMs(duration) : null;

    // Determine start point
    let startChapterId = chaptersData[0]?.chapter.id;
    let startSentenceIndex = 0;

    // 1. Check selection
    const now = Date.now();
    const lastSel = lastSelectionRef.current;

    // 2. From current page start
    const computedPageIdx = Math.round(scrollPos.value / Math.max(window.width, 1));
    if (viewableItemsRef.current.length > 0) {
      const firstVisible = viewableItemsRef.current[0].item as PageData | ChapterData;
      startChapterId = firstVisible.chapter.id;
      if ('charStart' in firstVisible) {
        // Horizontal page mode: find first sentence on this page
        const chData = chaptersData.find(c => c.chapter.id === startChapterId);
        if (chData) {
          const pageStartNorm = firstVisible.charStart;
          const sIdx = chData.sentences.findIndex(s => s.end > pageStartNorm);
          startSentenceIndex = sIdx !== -1 ? sIdx : 0;
        }
      } else {
        // Scroll mode: find first sentence at the top of visible content
        const focusY = scrollPos.value + 2;
        let accY = VERTICAL_CONTENT_PADDING_TOP;
        for (const cd of chaptersData) {
          const cl = chapterLayoutsRef.current[cd.chapter.id];
          if (!cl) continue;
          const chapterAbsY = accY;
          accY += cl.height + CHAPTER_MARGIN_BOTTOM;
          if (focusY >= chapterAbsY && focusY < chapterAbsY + cl.height) {
            startChapterId = cd.chapter.id;
            const ratio = Math.max(0, Math.min(1, (focusY - chapterAbsY) / cl.height));
            const estimatedCharOffset = Math.floor(ratio * cd.content.length);

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


    lastUserScrollRef.current = 0;

    const startingChapter = chaptersData.find(c => c.chapter.id === startChapterId);
    await ensurePostNotificationsPermission();
    nowPlaying.update({
      title: book?.title ?? '',
      subtitle: startingChapter?.chapter.title ?? '',
      artworkUri: book?.coverImageUri ?? undefined,
    });
    nowPlaying.setState('playing');

    if (startChapterId) {
      speakSentence(startChapterId, startSentenceIndex);
    }
  };

  const stopSpeech = () => {
    speakSessionRef.current++;
    tts.stop();
    pausedPositionRef.current = null;
    nowPlaying.reset();
    setIsSpeaking(false);
    isSpeakingRef.current = false;
    setIsTtsFallback(false);
    timerEndRef.current = null;
    if (speechTimerRef.current) {
      clearInterval(speechTimerRef.current);
      speechTimerRef.current = null;
    }
  };

  const pauseSpeech = () => {
    tts.stop();
    const pausedChapterId = currentSpeakingChapterId;
    const pausedSentenceIndex = currentSentenceIndex;
    if (pausedChapterId !== null) {
      pausedPositionRef.current = { chapterId: pausedChapterId, sentenceIndex: pausedSentenceIndex };
    }
    setIsSpeaking(false);
    isSpeakingRef.current = false;
    const chData = chaptersData.find(c => c.chapter.id === pausedChapterId);
    nowPlaying.update({
      title: book?.title ?? '',
      subtitle: chData?.chapter.title ?? '',
      artworkUri: book?.coverImageUri ?? undefined,
    });
    nowPlaying.setState('paused');
  };

  const resumeSpeech = () => {
    const savedPos = pausedPositionRef.current;
    pausedPositionRef.current = null;
    setIsTtsFallback(false);
    if (savedPos) {
      setIsSpeaking(true);
      isSpeakingRef.current = true;
      const chData = chaptersData.find(c => c.chapter.id === savedPos.chapterId);
      nowPlaying.update({
        title: book?.title ?? '',
        subtitle: chData?.chapter.title ?? '',
        artworkUri: book?.coverImageUri ?? undefined,
      });
      nowPlaying.setState('playing');
      speakSentence(savedPos.chapterId, savedPos.sentenceIndex);
    } else {
      startSpeechRef.current();
    }
  };

  useEffect(() => {
    startSpeechRef.current = startSpeechWithTimer;
    stopSpeechRef.current = stopSpeech;
    pauseSpeechRef.current = pauseSpeech;
    resumeSpeechRef.current = resumeSpeech;
    speakSentenceRef.current = speakSentence;
    handleRemoteSkipRef.current = handleRemoteSkip;
  });

  useEffect(() => {
    if (prevVoiceTypeRef.current === settings.voiceType) return;
    prevVoiceTypeRef.current = settings.voiceType;
    if (isSpeakingRef.current && currentSpeakingChapterId !== null) {
      speakSessionRef.current++;
      speakSentenceRef.current(currentSpeakingChapterId, currentSentenceIndex);
    }
  }, [settings.voiceType, currentSpeakingChapterId, currentSentenceIndex]);

  useEffect(() => {
    const unsubs: Array<() => void> = [];

    unsubs.push(nowPlaying.addListener('play', () => {
      if (!isSpeakingRef.current) resumeSpeechRef.current();
    }));
    unsubs.push(nowPlaying.addListener('pause', () => {
      if (isSpeakingRef.current) pauseSpeechRef.current();
    }));
    unsubs.push(nowPlaying.addListener('next', () => {
      handleRemoteSkipRef.current(+1);
    }));
    unsubs.push(nowPlaying.addListener('previous', () => {
      handleRemoteSkipRef.current(-1);
    }));
    unsubs.push(nowPlaying.addListener('interruption-begin', () => {
      if (isSpeakingRef.current) {
        wasPlayingBeforeInterruptionRef.current = true;
        pauseSpeechRef.current();
      } else {
        wasPlayingBeforeInterruptionRef.current = false;
      }
    }));
    unsubs.push(nowPlaying.addListener('interruption-end', () => {
      if (wasPlayingBeforeInterruptionRef.current) {
        wasPlayingBeforeInterruptionRef.current = false;
        resumeSpeechRef.current();
      }
    }));

    return () => {
      unsubs.forEach(u => u());
      nowPlaying.reset();
    };
  }, []);

  const speakSentence = (cId: string, sIndex: number) => {
    const session = speakSessionRef.current;
    const chData = chaptersData.find(c => c.chapter.id === cId);
    if (!chData) {
      stopSpeech();
      return;
    }

    if (sIndex >= chData.sentences.length) {
      const chIdx = chaptersData.findIndex(c => c.chapter.id === cId);
      const nextCh = chaptersData[chIdx + 1];
      if (nextCh) {
        speakSentence(nextCh.chapter.id, 0);
      } else {
        stopSpeech();
      }
      return;
    }

    setCurrentSpeakingChapterId(cId);

    const useLocalBatch = !isXfyunVoice(settings.voiceType);

    if (useLocalBatch) {
      // Batch-enqueue the rest of the chapter into Android TextToSpeech.
      // Once queued natively, sequential playback no longer depends on the JS
      // thread, so audio keeps going when the app is backgrounded (RN pauses
      // setTimeout via onHostPause). Cross-chapter advance still needs JS.
      for (let i = sIndex; i < chData.sentences.length; i++) {
        const sentenceText = prepareSentenceForTts(chData.sentences[i].text, 'offline');
        if (!sentenceText) continue;

        const idxAtEnqueue = i;
        const isLastInChapter = i === chData.sentences.length - 1;

        tts.speak(sentenceText, {
          language: 'zh-CN',
          rate: settingsRef.current.speechRate,
          onStart: () => {
            if (speakSessionRef.current !== session) return;
            setCurrentSentenceIndex(idxAtEnqueue);
          },
          onDone: () => {
            if (speakSessionRef.current !== session || !isSpeakingRef.current) return;
            if (timerEndRef.current !== null && Date.now() >= timerEndRef.current) {
              stopSpeech();
              return;
            }
            if (!isLastInChapter) return;
            const chIdx = chaptersData.findIndex(c => c.chapter.id === cId);
            const nextCh = chaptersData[chIdx + 1];
            if (nextCh) {
              speakSentence(nextCh.chapter.id, 0);
            } else {
              stopSpeech();
            }
          },
          onStopped: () => {},
          onError: (e) => {
            console.error('Speech error', e);
            stopSpeech();
          },
          onFallback: () => setIsTtsFallback(true),
        });
      }
      return;
    }

    // Cloud TTS path: keep one-sentence-at-a-time scheduling (cloud provider
    // re-stops the current player on each speak, so batching doesn't work).
    setCurrentSentenceIndex(sIndex);

    const sentence = prepareSentenceForTts(chData.sentences[sIndex].text, 'offline');
    if (!sentence) {
      if (isSpeakingRef.current && speakSessionRef.current === session) speakSentence(cId, sIndex + 1);
      return;
    }

    for (const offset of [1, 2]) {
      const nextIdx = sIndex + offset;
      if (nextIdx < chData.sentences.length) {
        const nextText = prepareSentenceForTts(chData.sentences[nextIdx].text, 'offline');
        if (nextText) tts.prefetch(nextText);
      }
    }

    tts.speak(sentence, {
      language: 'zh-CN',
      rate: settingsRef.current.speechRate,
      onDone: () => {
        setTimeout(() => {
          if (isSpeakingRef.current && speakSessionRef.current === session) speakSentence(cId, sIndex + 1);
        }, 50);
      },
      onStopped: () => {},
      onError: (e) => {
        console.error('Speech error', e);
        stopSpeech();
      },
      onFallback: () => setIsTtsFallback(true),
    });
  };

  const handleRemoteSkip = (delta: 1 | -1) => {
    const cId = currentSpeakingChapterId;
    if (cId === null) return;
    const chData = chaptersData.find(c => c.chapter.id === cId);
    if (!chData) return;

    const targetIdx = currentSentenceIndex + delta;

    if (targetIdx >= 0 && targetIdx < chData.sentences.length) {
      speakSessionRef.current++;
      tts.stop();
      speakSentence(cId, targetIdx);
      return;
    }

    const chIdx = chaptersData.findIndex(c => c.chapter.id === cId);
    if (delta === 1) {
      const nextCh = chaptersData[chIdx + 1];
      if (nextCh) {
        speakSessionRef.current++;
        tts.stop();
        speakSentence(nextCh.chapter.id, 0);
      } else {
        stopSpeech();
      }
    } else {
      const prevCh = chaptersData[chIdx - 1];
      if (prevCh && prevCh.sentences.length > 0) {
        speakSessionRef.current++;
        tts.stop();
        speakSentence(prevCh.chapter.id, prevCh.sentences.length - 1);
      }
    }
  };

  // Start/stop countdown interval when speaking state changes
  useEffect(() => {
    if (!isSpeaking || timerEndRef.current === null) return;
    const startInterval = () => {
      if (speechTimerRef.current) clearInterval(speechTimerRef.current);
      speechTimerRef.current = setInterval(() => {
        const end = timerEndRef.current;
        if (end !== null && Date.now() >= end) stopSpeech();
      }, 1000);
    };
    startInterval();
    return () => {
      if (speechTimerRef.current) {
        clearInterval(speechTimerRef.current);
        speechTimerRef.current = null;
      }
    };
  }, [isSpeaking]);

  // Recalculate end time when timer settings change mid-speech
  useEffect(() => {
    if (!isSpeakingRef.current) return;
    if (isSpeechTimerEnabled && speechTimerMinutes > 0) {
      timerEndRef.current = computeTimerEndMs(speechTimerMinutes);
      if (!speechTimerRef.current) {
        speechTimerRef.current = setInterval(() => {
          const end = timerEndRef.current;
          if (end !== null && Date.now() >= end) stopSpeech();
        }, 1000);
      }
    } else {
      timerEndRef.current = null;
    }
  }, [isSpeechTimerEnabled, speechTimerMinutes]);

  // Clean up
  useEffect(() => {
    return () => {
      stopSpeech();
      previewProviderRef.current?.stop().catch(() => {});
      previewProviderRef.current = null;
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
    if (isSpeakingRef.current) return;

    const normalizedLanguage = (voiceLanguage || '').toLowerCase();
    const previewText = normalizedLanguage.startsWith('zh') ? t('settings.voicePreviewZh') : t('settings.voicePreviewEn');
    const speechLanguage = normalizedLanguage.startsWith('zh') ? 'zh-CN' : 'en-US';

    if (previewProviderRef.current) {
      await previewProviderRef.current.stop();
    }

    const provider = isXfyunVoice(voiceId)
      ? new XfyunTtsProvider(voiceId)
      : new LocalTtsProvider(voiceId === 'default' ? undefined : voiceId);

    previewProviderRef.current = provider;
    setPreviewingVoiceId(voiceId);

    provider.speak(previewText, {
      language: speechLanguage,
      rate: settings.speechRate,
      onDone: () => setPreviewingVoiceId(current => current === voiceId ? null : current),
      onStopped: () => setPreviewingVoiceId(current => current === voiceId ? null : current),
      onError: () => setPreviewingVoiceId(current => current === voiceId ? null : current),
    });
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
    bg: isDark ? '#0E0C0A' : '#FAF7F0',
    surface: isDark ? '#1C1916' : '#F3ECE0',
    border: isDark ? '#2A2520' : '#E0D4C0',
    accent: isDark ? '#C4A96A' : '#A0621A',
    accentBg: isDark ? 'rgba(196,169,106,0.1)' : 'rgba(139,94,32,0.08)',
    accentBorder: isDark ? 'rgba(196,169,106,0.3)' : 'rgba(139,94,32,0.25)',
    red: '#D64040',
    textPrimary: isDark ? '#E8E0D0' : '#2C1A0E',
    textSub: isDark ? '#B0A080' : '#9A7A5A',
    bottomBar: isDark ? '#0A0806' : '#F3ECE0',
    iconBox: isDark ? '#2A2520' : '#E8DCC8',
    highlight: isDark ? '#3A2E12' : '#F7E8C4',
  }), [isDark]);

  const bgColor = readerColors.bg;
  const textColor = readerColors.textPrimary;
  const window = Dimensions.get('window');
  const centerTapTop = window.height * 0.25;
  const centerTapBottom = window.height * 0.75;
  const lineHeight = debouncedFontSize * debouncedLineSpacing;
  const horizontalLineHeight = lineHeight;
  const fontFamily = getFontFamilyForPreset(settings.fontPreset);
  const horizontalContentWidth = Math.max(window.width - 40, 1);
  const horizontalTopPadding = insets.top + 12;
  const horizontalBottomPadding = insets.bottom + 18;
  const horizontalContentHeight = Math.max(window.height - horizontalTopPadding - horizontalBottomPadding, horizontalLineHeight);
  const charsPerLine = Math.max(Math.floor(horizontalContentWidth / (debouncedFontSize * 1.05)), 1);
  const linesPerPage = Math.max(Math.floor(horizontalContentHeight / horizontalLineHeight) - 1, 1);
  const selectedVoiceLabel = useMemo(() => {
    const displayVoiceId = isTtsFallback ? (settings.backupVoice ?? 'default') : settings.voiceType;
    if (!displayVoiceId || displayVoiceId === 'default') return t('common.default');
    if (isTtsFallback && isXfyunVoice(displayVoiceId)) return t('common.default');
    const matchedVoice = voices.find((voice) => voice.identifier === displayVoiceId);
    if (!matchedVoice) return displayVoiceId;
    const base = getVoiceDisplayLabel(matchedVoice, displayVoiceId, t, language);
    return matchedVoice.quality === 'Cloud' ? `${base} · ${t('voice.cloud')}` : matchedVoice.quality === 'Premium' ? `${base} · ${t('voice.qualityPremium')}` : matchedVoice.quality === 'Enhanced' ? `${base} · ${t('voice.qualityEnhanced')}` : base;
  }, [language, settings.voiceType, settings.backupVoice, isTtsFallback, t, voices]);
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

  const horizontalPages = useMemo<PageData[]>(() => {
    if (settings.flipMode !== 'horizontal') {
      return [];
    }

    const pages = chaptersData.flatMap((chapterData) => {
      const displayContent = normalizeDisplayParagraphSpacing(chapterData.content);
      const charWidthFactor = estimateCharWidthFactor(chapterData.content);
      const adjustedCharsPerLine = Math.max(Math.floor(charsPerLine * (1.05 / charWidthFactor)), 1);
      const splitPages = splitChapterIntoPages(displayContent, adjustedCharsPerLine, linesPerPage);
      let cumOffset = 0;
      return splitPages.map((pageContent, index) => {
        const charStart = cumOffset;
        cumOffset += pageContent.length;
        const pageBlocks = chapterData.blocks ? getBlocksForPage(chapterData.blocks, charStart, pageContent) : undefined;
        return {
          id: `${chapterData.chapter.id}_page_${index + 1}`,
          chapter: chapterData.chapter,
          content: pageContent,
          pageNumber: index + 1,
          pageCount: splitPages.length,
          charStart,
          blocks: pageBlocks,
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
    const isHoriz = settings.flipMode === 'horizontal';
    if (!isHoriz) {
      const currentOffset = isAutoScrolling.value ? autoScrollOffset.value : scrollPos.value;
      const chapters = chaptersDataRef.current;
      let accY = VERTICAL_CONTENT_PADDING_TOP;
      let targetId: string | null = null;
      for (const cd of chapters) {
        const layout = chapterLayoutsRef.current[cd.chapter.id];
        if (!layout) { accY += 0; continue; }
        if (currentOffset < accY + layout.height + CHAPTER_MARGIN_BOTTOM) {
          targetId = cd.chapter.id;
          break;
        }
        accY += layout.height + CHAPTER_MARGIN_BOTTOM;
      }
      if (!targetId && chapters.length > 0) targetId = chapters[chapters.length - 1].chapter.id;
      if (targetId) {
        lastSavedChapterIdRef.current = targetId;
        void saveProgress(targetId);
      }
      return;
    }
    const currentItem = getCurrentVisibleReaderItem();
    if (!currentItem) return;
    lastSavedChapterIdRef.current = currentItem.chapter.id;
    void saveProgress(currentItem.chapter.id);
  }, [getCurrentVisibleReaderItem, settings.flipMode]);

  useEffect(() => {
    saveCurrentProgressRef.current = saveCurrentProgress;
  }, [saveCurrentProgress]);

  useEffect(() => {
    loadBookData();
    return () => {
      saveCurrentProgressRef.current();
      tts.stop();
      stopAutoFlip();
      if (scrollToIndexRetryTimerRef.current) {
        clearTimeout(scrollToIndexRetryTimerRef.current);
        scrollToIndexRetryTimerRef.current = null;
      }
    };
  }, [bookId, chapterId]);

  useEffect(() => {
    const unsubscribeBeforeRemove = navigation.addListener('beforeRemove', () => {
      stopSpeechRef.current();
      saveCurrentProgressRef.current();
    });

    const unsubscribeBlur = navigation.addListener('blur', () => {
      saveCurrentProgressRef.current();
    });

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'inactive' || nextAppState === 'background') {
        saveCurrentProgressRef.current();
      }
      if (nextAppState === 'active') {
        loadVoices();
      }
    });

    return () => {
      unsubscribeBeforeRemove();
      unsubscribeBlur();
      subscription.remove();
    };
  }, [navigation]);

  useEffect(() => {
    if (!isSpeaking || !currentSpeakingChapterId) return;
    const chData = chaptersData.find(c => c.chapter.id === currentSpeakingChapterId);
    nowPlaying.update({
      title: book?.title ?? '',
      subtitle: chData?.chapter.title ?? '',
      artworkUri: book?.coverImageUri ?? undefined,
    });
  }, [currentSpeakingChapterId, isSpeaking, book, chaptersData]);

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
          fontSize={debouncedFontSize}
          lineHeight={horizontalLineHeight}
          fontFamily={fontFamily}
          contentHeight={horizontalContentHeight}
          isDark={isDark}
          isMenuVisible={isMenuVisible}
          activeSentence={currentSpeakingChapterId === pageItem.chapter.id ? activeSentence : null}
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
        fontSize={debouncedFontSize}
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
    debouncedFontSize,
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
            bottom: (showAd && !isMenuVisible ? AD_BANNER_HEIGHT : 0) + insets.bottom,
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
          </View>
          <TouchableOpacity onPress={(e) => { e.stopPropagation(); toggleSpeech(); }} style={styles.miniCtrl} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <View style={styles.miniPause}>
              <View style={[styles.miniPauseBar, { backgroundColor: readerColors.accent }]} />
              <View style={[styles.miniPauseBar, { backgroundColor: readerColors.accent }]} />
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      {/* Footer Controls */}
      {isMenuVisible && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 10, backgroundColor: readerColors.bottomBar }]}>
          <AdBanner
            visible={showAd}
            onHidden={handleBannerHidden}
            onUpgradePress={() => navigation.navigate('Membership')}
            floating={false}
          />
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
              </View>
              <TouchableOpacity onPress={(e) => { e.stopPropagation(); toggleSpeech(); }} style={styles.miniCtrl} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <View style={styles.miniPause}>
                  <View style={[styles.miniPauseBar, { backgroundColor: readerColors.accent }]} />
                  <View style={[styles.miniPauseBar, { backgroundColor: readerColors.accent }]} />
                </View>
              </TouchableOpacity>
            </TouchableOpacity>
          )}
          {isTypographyPanelVisible ? (
            <View style={[styles.typoPanel, { backgroundColor: readerColors.bottomBar }]}>
              {/* Handle */}
              <View style={[styles.typoHandle, { backgroundColor: readerColors.border }]} />

              {/* 字号 + 行距 并排 */}
              <View style={styles.typoTopRow}>
                <View style={[styles.typoCol, { backgroundColor: readerColors.surface }]}>
                  <Text style={[styles.typoColLabel, { color: readerColors.textSub }]}>{t('reader.fontSizeLabel')}</Text>
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
                  <Text style={[styles.typoColLabel, { color: readerColors.textSub }]}>{t('reader.lineSpacingLabel')}</Text>
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
              <Text style={[styles.typoChipsLabel, { color: readerColors.textSub }]}>{t('reader.typography')}</Text>
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
                  {t('reader.typography')}
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
                    color={settings.autoFlip ? readerColors.red : readerColors.textSub}
                  />
                </View>
                <Text style={[styles.ctrlLabel, { color: settings.autoFlip ? readerColors.red : readerColors.textSub }]}>
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
                  <Ionicons name={isSpeaking ? 'mic' : 'mic-outline'} size={20} color={isSpeaking ? readerColors.red : readerColors.textSub} />
                </View>
                <Text style={[styles.ctrlLabel, { color: isSpeaking ? readerColors.red : readerColors.textSub }]}>
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

          {/* 三键控制 */}
          <View style={styles.ttsControls}>
            <TouchableOpacity
              style={[styles.ttsSmBtn, { backgroundColor: readerColors.iconBox }]}
              onPress={() => {
                const chData = chaptersData.find(c => c.chapter.id === currentSpeakingChapterId);
                if (chData && currentSentenceIndex > 0) {
                  speakSessionRef.current++;
                  tts.stop();
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
                  speakSessionRef.current++;
                  tts.stop();
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
              style={[styles.ttsChip, { backgroundColor: isTtsVoicePickerVisible ? readerColors.accentBg : readerColors.iconBox, borderWidth: isTtsVoicePickerVisible ? 1 : 0, borderColor: readerColors.accentBorder }]}
              onPress={() => setIsTtsVoicePickerVisible(v => !v)}
            >
              <Text style={[styles.ttsChipText, { color: isTtsVoicePickerVisible ? readerColors.accent : readerColors.textSub }]} numberOfLines={1}>
                {selectedVoiceLabel}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.ttsChip, { backgroundColor: readerColors.iconBox }]}
              onPress={() => {
                const options = __DEV__ ? [1, 5, 0] :[15, 30, 60, 120, 0];
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
        <VoicePickerModal
          visible={isTtsVoicePickerVisible}
          onClose={() => setIsTtsVoicePickerVisible(false)}
          voices={voices}
          selectedVoice={settings.voiceType ?? 'default'}
          previewingVoiceId={previewingVoiceId}
          onVoiceTap={(id, lang) => {
            requestAccess(id, lang, {
              onGranted: (grantedId, grantedLang) => {
                updateSettings({ voiceType: grantedId });
                previewVoice(grantedId, grantedLang);
              },
              onBeforeAd: () => setIsTtsVoicePickerVisible(false),
            });
          }}
          defaultLang="zh-CN"
          t={t}
          colors={{ bg: readerColors.bg, surface: readerColors.surface, border: readerColors.border, accent: readerColors.accent, accentBg: readerColors.accentBg, textPrimary: readerColors.textPrimary, textSub: readerColors.textSub }}
          onNotInstalledTap={openVoiceSettings}
        />
      </Modal>
      <AdBanner
        visible={showAd && !isMenuVisible}
        onHidden={handleBannerHidden}
        onUpgradePress={() => navigation.navigate('Membership')}
      />
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
  ttsVoicePicker: {
    width: '100%',
    maxHeight: 260,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 14,
    overflow: 'hidden',
  },
  ttsVoiceOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
    position: 'relative',
  },
  ttsVoiceOptionBar: {
    width: 3,
    height: 16,
    borderRadius: 2,
    marginRight: 10,
  },
  ttsVoiceOptionText: {
    fontSize: 13,
    letterSpacing: 0.1,
  },
  ttsVoiceQualityBadge: {
    fontSize: 10,
    marginLeft: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    overflow: 'hidden',
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
