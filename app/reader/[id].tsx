import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  TouchableOpacity, 
  Dimensions, 
  ScrollView,
  Animated,
  SafeAreaView,
  ActivityIndicator,
  Platform,
  TextStyle,
  FlatList,
  Modal
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system';
import { StatusBar } from 'expo-status-bar';
import { FontAwesome, Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { BookStorage } from '@/services/BookStorage';
import { Book } from '@/types/Book';
import { useLanguage } from '@/contexts/LanguageContext';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';

// 添加阅读相关的翻译
const READ_TRANSLATIONS = {
  zh: {
    loadingBook: '正在加载书籍...',
    errorLoading: '加载书籍失败',
    fileNotReadable: '文件无法读取',
    fileNotFound: '找不到文件',
    back: '返回',
    chapters: '目录',
    settings: '设置',
    fontSize: '字体大小',
    brightness: '亮度',
    fontStyle: '字体样式',
    noContent: '无法显示内容',
    retry: '重试',
  },
  en: {
    loadingBook: 'Loading book...',
    errorLoading: 'Failed to load book',
    fileNotReadable: 'File is not readable',
    fileNotFound: 'File not found',
    back: 'Back',
    chapters: 'Chapters',
    settings: 'Settings',
    fontSize: 'Font Size',
    brightness: 'Brightness',
    fontStyle: 'Font Style',
    noContent: 'Content cannot be displayed',
    retry: 'Retry',
  }
};

// 阅读器状态
enum ReaderMode {
  READING = 'reading',  // 普通阅读模式
  CONTROLS = 'controls', // 显示控制栏
  TOC = 'toc',          // 目录模式
  SETTINGS = 'settings'  // 设置模式
}

// 设置选项
interface ReaderSettings {
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  theme: 'light' | 'dark' | 'sepia';
}

export default function ReaderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { language, t } = useLanguage();
  const colorScheme = useColorScheme();
  const router = useRouter();
  
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(0);
  
  // 阅读器状态
  const [readerMode, setReaderMode] = useState<ReaderMode>(ReaderMode.READING);
  const controlsOpacity = useRef(new Animated.Value(0)).current;
  
  // 阅读设置
  const [settings, setSettings] = useState<ReaderSettings>({
    fontSize: 18,
    fontFamily: 'System',
    lineHeight: 1.5,
    theme: colorScheme === 'dark' ? 'dark' : 'light'
  });
  
  // 目录信息
  const [chapters, setChapters] = useState<{title: string, position: number}[]>([]);
  
  // 添加目录和设置模态框的状态
  const [isTableOfContentsVisible, setIsTableOfContentsVisible] = useState(false);
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const contentLinePositions = useRef<number[]>([]);
  
  // 添加refreshKey状态用于刷新
  const [refreshKey, setRefreshKey] = useState(0);
  
  // 将loadBook函数移到useEffect内部
  useEffect(() => {
    const loadBook = async () => {
      if (!id) return;
      
      try {
        setLoading(true);
        setError(null);
        
        // 获取书籍详情
        const bookData = await BookStorage.getBook(id);
        if (!bookData) {
          throw new Error(READ_TRANSLATIONS[language as 'zh' | 'en'].fileNotFound);
        }
        
        setBook(bookData);
        
        // 检查文件是否存在
        const fileInfo = await FileSystem.getInfoAsync(bookData.filePath);
        if (!fileInfo.exists) {
          throw new Error(READ_TRANSLATIONS[language as 'zh' | 'en'].fileNotFound);
        }
        
        console.log('开始读取书籍内容:', bookData.filePath);
        
        try {
          // 使用BookStorage提供的方法读取内容
          const bookContent = await BookStorage.readBookContent(bookData.filePath, bookData.fileType);
          
          if (bookData.fileType.includes('text/plain')) {
            // 处理章节
            const lines = bookContent.split('\n');
            const detectedChapters = [];
            
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i].trim();
              // 简单规则：认为短行且全部字符为大写或包含第/章/卷等字样的是章节标题
              if ((line.length < 30 && line.length > 0) && 
                  (line.toUpperCase() === line || 
                   /第.{1,3}[章节卷篇]|chapter|section|part/i.test(line))) {
                detectedChapters.push({
                  title: line,
                  position: i
                });
              }
            }
            
            setChapters(detectedChapters);
          }
          
          setContent(bookContent);
          console.log('书籍内容加载成功');
        } catch (readError) {
          console.error('读取文件内容失败:', readError);
          throw new Error(READ_TRANSLATIONS[language as 'zh' | 'en'].fileNotReadable);
        }
        
        // 更新上次阅读时间
        try {
          await BookStorage.updateBook({
            ...bookData,
            lastRead: new Date()
          });
        } catch (updateError) {
          // 仅记录错误，不影响阅读体验
          console.warn('更新阅读时间失败:', updateError);
        }
        
      } catch (error) {
        console.error('加载书籍失败:', error);
        setError(error instanceof Error ? error.message : '未知错误');
      } finally {
        setLoading(false);
      }
    };

    loadBook();
  }, [id, language, refreshKey]);
  
  // 处理点击屏幕中心区域
  const handleCenterTap = () => {
    if (readerMode !== ReaderMode.READING) {
      // 如果控制栏已显示，则隐藏
      setReaderMode(ReaderMode.READING);
      Animated.timing(controlsOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true
      }).start();
    } else {
      // 否则显示控制栏
      setReaderMode(ReaderMode.CONTROLS);
      Animated.timing(controlsOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true
      }).start();
    }
  };
  
  // 返回书架
  const handleBack = () => {
    router.back();
  };
  
  // 字体大小调整
  const increaseFontSize = () => {
    setSettings(prev => ({
      ...prev,
      fontSize: Math.min(prev.fontSize + 2, 32)
    }));
  };
  
  const decreaseFontSize = () => {
    setSettings(prev => ({
      ...prev,
      fontSize: Math.max(prev.fontSize - 2, 12)
    }));
  };
  
  // 显示目录
  const showTableOfContents = () => {
    setIsTableOfContentsVisible(true);
    setReaderMode(ReaderMode.TOC);
  };
  
  // 隐藏目录
  const hideTableOfContents = () => {
    setIsTableOfContentsVisible(false);
    setReaderMode(ReaderMode.CONTROLS);
  };
  
  // 跳转到特定章节
  const scrollToChapter = (position: number) => {
    if (scrollViewRef.current && contentLinePositions.current.length > 0) {
      const lineHeight = settings.fontSize * settings.lineHeight;
      const targetPosition = position * lineHeight;
      scrollViewRef.current.scrollTo({ y: targetPosition, animated: true });
      hideTableOfContents();
    }
  };
  
  // 渲染文本内容（更新以跟踪行位置）
  const renderContent = () => {
    if (!content) {
      return (
        <ThemedText style={styles.noContent}>
          {READ_TRANSLATIONS[language as 'zh' | 'en'].noContent}
        </ThemedText>
      );
    }
    
    // 对于TXT文件，我们需要计算每行的位置
    // 首次渲染后，我们会存储内容的行位置
    const lines = content.split('\n');
    
    // 初始化行位置数组
    if (contentLinePositions.current.length === 0) {
      contentLinePositions.current = Array(lines.length).fill(0);
      for (let i = 0; i < lines.length; i++) {
        contentLinePositions.current[i] = i;
      }
    }
    
    return (
      <ScrollView
        ref={scrollViewRef}
        style={styles.contentScroll}
        contentContainerStyle={styles.contentContainer}
      >
        <ThemedText
          style={[
            styles.contentText,
            {
              fontSize: settings.fontSize,
              lineHeight: settings.fontSize * settings.lineHeight,
              fontFamily: settings.fontFamily
            }
          ]}
        >
          {content}
        </ThemedText>
      </ScrollView>
    );
  };
  
  // 渲染控制栏
  const renderControls = () => {
    return (
      <Animated.View 
        style={[
          styles.controlsContainer,
          { opacity: controlsOpacity }
        ]}
        pointerEvents={readerMode !== ReaderMode.READING ? 'auto' : 'none'}
      >
        {/* 顶部控制栏 */}
        <SafeAreaView style={styles.topControls}>
          <TouchableOpacity onPress={handleBack} style={styles.controlButton}>
            <Ionicons name="arrow-back" size={24} color="white" />
            <Text style={styles.controlText}>
              {READ_TRANSLATIONS[language as 'zh' | 'en'].back}
            </Text>
          </TouchableOpacity>
          
          <Text style={styles.titleText} numberOfLines={1}>
            {book?.title}
          </Text>
          
          <View style={styles.controlButton} />
        </SafeAreaView>
        
        {/* 底部控制栏 */}
        <SafeAreaView style={styles.bottomControls}>
          <TouchableOpacity 
            style={styles.controlButton}
            onPress={showTableOfContents}
          >
            <Ionicons name="list" size={24} color="white" />
            <Text style={styles.controlText}>
              {READ_TRANSLATIONS[language as 'zh' | 'en'].chapters}
            </Text>
          </TouchableOpacity>
          
          <View style={styles.fontControls}>
            <TouchableOpacity onPress={decreaseFontSize} style={styles.fontButton}>
              <Text style={styles.fontButtonText}>A-</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={increaseFontSize} style={styles.fontButton}>
              <Text style={styles.fontButtonText}>A+</Text>
            </TouchableOpacity>
          </View>
          
          <TouchableOpacity 
            style={styles.controlButton}
            onPress={() => setIsSettingsVisible(true)}
          >
            <Ionicons name="settings-outline" size={24} color="white" />
            <Text style={styles.controlText}>
              {READ_TRANSLATIONS[language as 'zh' | 'en'].settings}
            </Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Animated.View>
    );
  };
  
  // 渲染目录模态框
  const renderTableOfContents = () => {
    return (
      <Modal
        visible={isTableOfContentsVisible}
        transparent
        animationType="slide"
        onRequestClose={hideTableOfContents}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{READ_TRANSLATIONS[language as 'zh' | 'en'].chapters}</Text>
              <TouchableOpacity onPress={hideTableOfContents}>
                <Ionicons name="close" size={24} color="#000" />
              </TouchableOpacity>
            </View>
            
            <FlatList
              data={chapters}
              keyExtractor={(item, index) => `chapter-${index}`}
              renderItem={({ item, index }) => (
                <TouchableOpacity 
                  style={styles.chapterItem}
                  onPress={() => scrollToChapter(item.position)}
                >
                  <Text style={styles.chapterTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                </TouchableOpacity>
              )}
              contentContainerStyle={{ paddingBottom: 20 }}
            />
          </View>
        </View>
      </Modal>
    );
  };
  
  // 修改handleRetry函数
  const handleRetry = () => {
    setRefreshKey(prev => prev + 1); // 通过改变refreshKey触发useEffect重新执行
  };
  
  // 渲染加载中
  if (loading) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors[colorScheme ?? 'light'].tint} />
        <ThemedText style={styles.loadingText}>
          {READ_TRANSLATIONS[language as 'zh' | 'en'].loadingBook}
        </ThemedText>
      </ThemedView>
    );
  }
  
  // 渲染错误
  if (error) {
    return (
      <ThemedView style={styles.errorContainer}>
        <ThemedText style={styles.errorText}>
          {READ_TRANSLATIONS[language as 'zh' | 'en'].errorLoading}: {error}
        </ThemedText>
        <View style={styles.errorButtons}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <ThemedText style={styles.backButtonText}>
              {READ_TRANSLATIONS[language as 'zh' | 'en'].back}
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleRetry} style={[styles.backButton, { marginLeft: 10, backgroundColor: '#4CAF50' }]}>
            <ThemedText style={styles.backButtonText}>
              {READ_TRANSLATIONS[language as 'zh' | 'en'].retry}
            </ThemedText>
          </TouchableOpacity>
        </View>
      </ThemedView>
    );
  }
  
  return (
    <View 
      style={[
        styles.container, 
        settings.theme === 'sepia' ? styles.sepiaContainer : 
        settings.theme === 'dark' ? styles.darkContainer : 
        styles.lightContainer
      ]}
    >
      <StatusBar hidden={readerMode === ReaderMode.READING} />
      
      {/* 隐藏标题栏 */}
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* 阅读区域 */}
      <TouchableOpacity 
        activeOpacity={1}
        style={styles.readerArea} 
        onPress={handleCenterTap}
      >
        {renderContent()}
      </TouchableOpacity>
      
      {/* 控制栏 */}
      {renderControls()}
      
      {/* 目录模态框 */}
      {renderTableOfContents()}
    </View>
  );
}

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  lightContainer: {
    backgroundColor: '#FFF',
  },
  darkContainer: {
    backgroundColor: '#1A1A1A',
  },
  sepiaContainer: {
    backgroundColor: '#F8F1E3',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  backButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#2196F3',
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  readerArea: {
    flex: 1,
  },
  contentScroll: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  contentText: {
    fontSize: 18,
    lineHeight: 27,
  },
  noContent: {
    padding: 20,
    fontSize: 16,
    textAlign: 'center',
  },
  controlsContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  topControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  bottomControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  controlButton: {
    alignItems: 'center',
    width: 80,
  },
  controlText: {
    color: 'white',
    fontSize: 12,
    marginTop: 4,
  },
  titleText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  fontControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fontButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginHorizontal: 5,
  },
  fontButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 16,
    maxHeight: height * 0.7,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  chapterItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  chapterTitle: {
    fontSize: 16,
  },
  errorButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
}); 