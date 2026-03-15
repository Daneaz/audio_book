import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, TouchableOpacity, ActivityIndicator, StatusBar, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import BookService from '../services/BookService';
import ChapterService from '../services/ChapterService';
import StorageService from '../services/StorageService';
import { STORAGE_KEYS } from '../utils/constants';
import { Book, Chapter, ReadingProgress } from '../types';

const { width, height } = Dimensions.get('window');

import useSettings from '../hooks/useSettings';

export default function ReaderScreen({ route, navigation }: any) {
  const { bookId, chapterId } = route.params;
  const insets = useSafeAreaInsets();
  
  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [chapterContent, setChapterContent] = useState('');
  const [sentences, setSentences] = useState<string[]>([]);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const isSpeakingRef = useRef(false);
  const [timerDuration, setTimerDuration] = useState<number | null>(null); // in minutes
  const [timerRemaining, setTimerRemaining] = useState<number | null>(null); // in seconds
  const speechTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  const { settings, updateSettings } = useSettings();
  
  const scrollViewRef = useRef<ScrollView>(null);
  const autoFlipTimer = useRef<NodeJS.Timeout | null>(null);
  const scrollY = useRef(0);

  const handleScroll = (event: any) => {
    scrollY.current = event.nativeEvent.contentOffset.y;
  };

  useEffect(() => {
    loadBookData();
    return () => {
      Speech.stop();
      stopAutoFlip();
    };
  }, [bookId, chapterId]);

  useEffect(() => {
    if (settings.autoFlip) {
      startAutoFlip();
    } else {
      stopAutoFlip();
    }
    return () => stopAutoFlip();
  }, [settings.autoFlip, settings.flipInterval]);

  const startAutoFlip = () => {
    stopAutoFlip();
    const interval = (settings.flipInterval || 30) * 1000;
    autoFlipTimer.current = setInterval(() => {
      const nextY = scrollY.current + height * 0.8;
      scrollViewRef.current?.scrollTo({ y: nextY, animated: true });
    }, interval);
  };

  const stopAutoFlip = () => {
    if (autoFlipTimer.current) {
      clearInterval(autoFlipTimer.current);
      autoFlipTimer.current = null;
    }
  };

  const loadBookData = async () => {
    try {
      const books = await BookService.getBooks();
      const currentBook = books.find(b => b.id === bookId);
      if (!currentBook) {
        navigation.goBack();
        return;
      }
      setBook(currentBook);

      const loadedChapters = await StorageService.getData(`${STORAGE_KEYS.CHAPTERS_PREFIX}${bookId}`);
      setChapters(loadedChapters || []);

      let initialChapterIndex = 0;
      
      // Priority: route param > stored progress > 0
      if (chapterId) {
          const idx = loadedChapters.findIndex((c: Chapter) => c.id === chapterId);
          if (idx !== -1) initialChapterIndex = idx;
      } else {
          // Load progress
          const progressKey = `${STORAGE_KEYS.READING_PROGRESS_PREFIX}${bookId}`;
          const progress = await StorageService.getData(progressKey);
          
          if (progress && progress.chapterId) {
              const idx = loadedChapters.findIndex((c: Chapter) => c.id === progress.chapterId);
              if (idx !== -1) initialChapterIndex = idx;
          }
      }
      
      setCurrentChapterIndex(initialChapterIndex);
      await loadChapterContent(currentBook, loadedChapters[initialChapterIndex]);
      
      setLoading(false);
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  const loadChapterContent = async (book: Book, chapter: Chapter) => {
    if (!book || !chapter) return;
    setLoading(true);
    const content = await ChapterService.getChapterContent(book.filePath, chapter.startPosition, chapter.endPosition);
    setChapterContent(content);
    // Split content into sentences
    // Split by common Chinese punctuation: 。！？；!?; and newlines
    // Split content into sentences
    // First, normalize line breaks to avoid issues
    const normalizedContent = content.replace(/\r\n/g, '\n');
    
    // Split by common Chinese punctuation but capture the delimiter
    // The regex captures:
    // 1. The sentence content
    // 2. The punctuation mark (。！？；!?)
    // 3. Any closing quotes or brackets that immediately follow (”’"']*)
    // This is a simplified approach; a more robust one involves complex lookaheads or a tokenizer.
    // For now, let's use a two-pass approach which is safer.

    // Pass 1: Split by sentence terminators
    const rawParts = normalizedContent.split(/([。！？；!?;]+)/);
    
    const tempSentences: string[] = [];
    for (let i = 0; i < rawParts.length; i++) {
        const part = rawParts[i];
        if (!part) continue; // Skip empty strings
        
        // If it's a punctuation mark, append to the last sentence
        if (/^[。！？；!?;]+$/.test(part)) {
             if (tempSentences.length > 0) {
                 tempSentences[tempSentences.length - 1] += part;
             } else {
                 tempSentences.push(part); // Should rarely happen (punctuation at start)
             }
        } else {
             tempSentences.push(part);
        }
    }
    
    // Pass 2: Merge trailing closing quotes/brackets/spaces into the previous sentence
    // This handles: "你好。" -> "你好。" and "”" -> merged
    const finalSentences: string[] = [];
    for (let i = 0; i < tempSentences.length; i++) {
        const current = tempSentences[i];
        
        // Check if current segment is just closing quotes/brackets or whitespace
        // e.g. "”" or "  ”  "
        if (/^[”’"'\s\n\r]*$/.test(current) && finalSentences.length > 0) {
            finalSentences[finalSentences.length - 1] += current;
        } else {
            finalSentences.push(current);
        }
    }
    
    setSentences(finalSentences);
    setCurrentSentenceIndex(0);
    setLoading(false);
    // Scroll to top
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
  };

  const handleChapterChange = async (index: number) => {
      if (index < 0 || index >= chapters.length) return;
      setCurrentChapterIndex(index);
      await loadChapterContent(book!, chapters[index]);
      saveProgress(chapters[index].id);
  };

  const saveProgress = async (chapterId: string) => {
      const progress: ReadingProgress = {
          id: `progress_${bookId}`,
          bookId,
          chapterId,
          currentPosition: 0, // Simplified: always save start of chapter for now
          currentPage: 0,
          readingMode: 'scroll',
          updatedAt: new Date().toISOString()
      };
      await StorageService.storeData(`${STORAGE_KEYS.READING_PROGRESS_PREFIX}${bookId}`, progress);
      
      // Update book last read
      if (book) {
          const updatedBook = { ...book, lastReadAt: new Date().toISOString() };
          await BookService.updateBook(updatedBook);
      }
  };

  const toggleSpeech = () => {
      if (isSpeaking) {
          stopSpeech();
      } else {
          startSpeech();
      }
  };

  const handleSentencePress = (index: number) => {
      // Always set the current index
      setCurrentSentenceIndex(index);
      
      // If already speaking, restart from this sentence
      if (isSpeaking) {
          stopSpeech();
          setTimeout(() => {
              startSpeech(index);
          }, 100);
      }
      // If not speaking, just select it (highlight). 
      // User can press "Read" button to start from here.
  };

  const startSpeech = (startIndex?: number) => {
      setIsSpeaking(true);
      isSpeakingRef.current = true;
      if (timerDuration !== null && timerRemaining === null) {
          setTimerRemaining(timerDuration * 60);
      }
      speakSentence(startIndex !== undefined ? startIndex : currentSentenceIndex);
  };

  const stopSpeech = () => {
      Speech.stop();
      setIsSpeaking(false);
      isSpeakingRef.current = false;
      if (speechTimerRef.current) {
          clearInterval(speechTimerRef.current);
          speechTimerRef.current = null;
      }
  };

  const speakSentence = (index: number) => {
      if (index >= sentences.length) {
          stopSpeech();
          return;
      }
      
      const sentence = sentences[index];
      Speech.speak(sentence, {
          language: 'zh-CN',
          rate: 1.0,
          onDone: () => {
             // Use a timeout to ensure state updates are processed and to allow for a slight pause
             setTimeout(() => {
                 if (isSpeakingRef.current) { // Check if still speaking (might have been stopped)
                     setCurrentSentenceIndex(prev => {
                         const nextIndex = prev + 1;
                         speakSentence(nextIndex);
                         return nextIndex;
                     });
                 }
             }, 100);
          },
          onStopped: () => {
              // Do nothing, handled by stopSpeech
          },
          onError: (e) => {
              console.error("Speech error", e);
              stopSpeech();
          }
      });
  };

  // Timer effect
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
  
  // Clean up on unmount
  useEffect(() => {
      return () => {
          stopSpeech();
      };
  }, []);

  const toggleTheme = () => {
      updateSettings({ theme: settings.theme === 'light' ? 'dark' : 'light' });
  };

  const increaseFontSize = () => updateSettings({ fontSize: Math.min(settings.fontSize + 2, 30) });
  const decreaseFontSize = () => updateSettings({ fontSize: Math.max(settings.fontSize - 2, 12) });

  const cycleTimer = () => {
      if (timerDuration === null) setTimerDuration(15);
      else if (timerDuration === 15) setTimerDuration(30);
      else if (timerDuration === 30) setTimerDuration(60);
      else if (timerDuration === 60) setTimerDuration(120);
      else setTimerDuration(null);
  };

  const getTimerText = () => {
      if (timerDuration === null) return 'Timer';
      if (isSpeaking && timerRemaining !== null) {
          const mins = Math.floor(timerRemaining / 60);
          const secs = timerRemaining % 60;
          return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
      }
      return `${timerDuration}m`;
  };

  if (loading && !book) {
      return (
          <View style={[styles.container, styles.center]}>
              <ActivityIndicator size="large" />
          </View>
      );
  }

  const currentChapter = chapters[currentChapterIndex];
  const isDark = settings.theme === 'dark';
  const bgColor = isDark ? '#121212' : '#ffffff';
  const textColor = isDark ? '#e0e0e0' : '#333333';

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} hidden={!isMenuVisible} />
      
      {/* Header */}
      {isMenuVisible && (
          <View style={[styles.header, { paddingTop: insets.top, backgroundColor: isDark ? '#1E1E1E' : '#f8f8f8' }]}>
              <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
                  <Ionicons name="arrow-back" size={24} color={textColor} />
              </TouchableOpacity>
              <Text style={[styles.headerTitle, { color: textColor }]} numberOfLines={1}>
                  {currentChapter?.title || book?.title}
              </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Chapters', { bookId })} style={styles.iconButton}>
                  <Ionicons name="list" size={24} color={textColor} />
              </TouchableOpacity>
          </View>
      )}

      {/* Content */}
      <TouchableOpacity 
          activeOpacity={1} 
          onPress={() => setIsMenuVisible(!isMenuVisible)}
          style={styles.contentContainer}
      >
          <ScrollView 
              ref={scrollViewRef}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 40, paddingBottom: 100 }}
              showsVerticalScrollIndicator={false}
          >
              <Text style={[styles.content, { fontSize: settings.fontSize, color: textColor, lineHeight: settings.fontSize * 1.5 }]}>
                  {sentences.map((sentence, index) => (
                      <Text 
                          key={index} 
                          style={index === currentSentenceIndex ? { backgroundColor: isSpeaking ? '#007AFF' : '#CCCCCC', color: isSpeaking ? 'white' : textColor } : undefined}
                          onPress={() => handleSentencePress(index)}
                      >
                          {sentence}
                      </Text>
                  ))}
              </Text>
              
              <View style={styles.chapterNav}>
                  <TouchableOpacity 
                      onPress={() => handleChapterChange(currentChapterIndex - 1)}
                      disabled={currentChapterIndex === 0}
                      style={[styles.navButton, currentChapterIndex === 0 && styles.disabledButton]}
                  >
                      <Text style={[styles.navButtonText, { color: textColor }]}>Previous Chapter</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                      onPress={() => handleChapterChange(currentChapterIndex + 1)}
                      disabled={currentChapterIndex === chapters.length - 1}
                      style={[styles.navButton, currentChapterIndex === chapters.length - 1 && styles.disabledButton]}
                  >
                      <Text style={[styles.navButtonText, { color: textColor }]}>Next Chapter</Text>
                  </TouchableOpacity>
              </View>
          </ScrollView>
      </TouchableOpacity>

      {/* Footer Controls */}
      {isMenuVisible && (
          <View style={[styles.footer, { paddingBottom: insets.bottom + 10, backgroundColor: isDark ? '#1E1E1E' : '#f8f8f8' }]}>
              <View style={styles.controlsRow}>
                  <TouchableOpacity onPress={decreaseFontSize} style={styles.controlButton}>
                      <Ionicons name="text" size={20} color={textColor} />
                      <Text style={{ fontSize: 12, color: textColor }}>A-</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity onPress={increaseFontSize} style={styles.controlButton}>
                      <Ionicons name="text" size={28} color={textColor} />
                      <Text style={{ fontSize: 12, color: textColor }}>A+</Text>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={toggleTheme} style={styles.controlButton}>
                      <Ionicons name={isDark ? "sunny" : "moon"} size={24} color={textColor} />
                      <Text style={{ fontSize: 12, color: textColor }}>Theme</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity onPress={cycleTimer} style={styles.controlButton}>
                      <Ionicons name="timer-outline" size={24} color={timerDuration ? (isSpeaking ? 'red' : 'blue') : textColor} />
                      <Text style={{ fontSize: 12, color: textColor }}>{getTimerText()}</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity onPress={toggleSpeech} style={styles.controlButton}>
                      <Ionicons name={isSpeaking ? "pause-circle" : "play-circle"} size={32} color={textColor} />
                      <Text style={{ fontSize: 12, color: textColor }}>{isSpeaking ? 'Pause' : 'Read'}</Text>
                  </TouchableOpacity>
              </View>
          </View>
      )}
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
  contentContainer: {
      flex: 1,
  },
  content: {
      textAlign: 'justify',
  },
  footer: {
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: '#ccc',
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
  },
  controlsRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'center',
  },
  controlButton: {
      alignItems: 'center',
      justifyContent: 'center',
      padding: 10,
  },
  chapterNav: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 40,
      marginBottom: 20,
  },
  navButton: {
      padding: 10,
      borderWidth: 1,
      borderColor: '#ccc',
      borderRadius: 5,
  },
  disabledButton: {
      opacity: 0.3,
  },
  navButtonText: {
      fontSize: 14,
  }
});
