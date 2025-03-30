import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, FlatList, Alert, View } from 'react-native';
import { Stack } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';
import { useLanguage } from '@/contexts/LanguageContext';

type Book = {
  id: string;
  title: string;
  author?: string;
  filePath: string;
  fileType: string;
  coverUrl?: string;
  lastRead?: Date;
};

export default function BookshelfScreen() {
  const colorScheme = useColorScheme();
  const { t } = useLanguage();
  const [books, setBooks] = useState<Book[]>([]);

  // 初始化音频系统
  React.useEffect(() => {
    const setupAudio = async () => {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
          allowsRecordingIOS: false,
          interruptionModeIOS: InterruptionModeIOS.DuckOthers,
          interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
        });
        console.log("音频系统初始化成功");
      } catch (error) {
        console.error("初始化音频设置失败:", error);
      }
    };

    setupAudio();
  }, []);

  const importBook = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/epub+zip',  // EPUB
          'text/plain',            // TXT
          'application/pdf',       // PDF
        ],
        copyToCacheDirectory: true
      });
      
      if (result.canceled) {
        console.log(t('filePickerCancelled'));
        return;
      }
      
      const file = result.assets[0];
      const fileType = file.mimeType || '未知';
      const fileName = file.name || '未命名';
      
      console.log('导入的文件:', file);
      
      // 检查文件类型
      if (!(fileType.includes('epub') || fileType.includes('text/plain') || fileType.includes('pdf'))) {
        Alert.alert(t('unsupportedFileType'), t('unsupportedFileTypeMessage'));
        return;
      }
      
      // 添加新书到列表
      const newBook: Book = {
        id: Date.now().toString(),
        title: fileName.replace(/\.[^/.]+$/, ''), // 移除文件扩展名作为标题
        filePath: file.uri,
        fileType: fileType,
        lastRead: new Date(),
      };
      
      setBooks(prevBooks => [...prevBooks, newBook]);
      Alert.alert(t('importSuccess'), t('importSuccessMessage', { title: newBook.title }));
      
    } catch (error) {
      console.error('导入文件失败:', error);
      Alert.alert(t('importFailed'), t('importFailedMessage'));
    }
  };

  const renderBookItem = ({ item }: { item: Book }) => (
    <TouchableOpacity
      style={styles.bookItem}
      onPress={() => Alert.alert('提示', t('openBook', { title: item.title }))}>
      <View style={styles.bookCover}>
        {item.coverUrl ? (
          <ThemedText>封面图片</ThemedText>
        ) : (
          <ThemedText style={styles.bookTypeLabel}>
            {item.fileType.includes('epub') ? t('epub') :
             item.fileType.includes('text/plain') ? t('txt') : t('pdf')}
          </ThemedText>
        )}
      </View>
      <ThemedText style={styles.bookTitle} numberOfLines={2}>{item.title}</ThemedText>
    </TouchableOpacity>
  );

  return (
    <>
      <Stack.Screen 
        options={{
          title: t('bookshelfTitle'),
          headerShown: true,
          headerRight: () => (
            <TouchableOpacity onPress={importBook} style={styles.importButton}>
              <IconSymbol 
                name="plus" 
                size={24} 
                color={Colors[colorScheme ?? 'light'].tint} 
              />
            </TouchableOpacity>
          ),
        }} 
      />
      <ThemedView style={styles.container}>
        {books.length > 0 ? (
          <FlatList
            data={books}
            renderItem={renderBookItem}
            keyExtractor={item => item.id}
            numColumns={3}
            contentContainerStyle={styles.bookList}
          />
        ) : (
          <ThemedView style={styles.emptyStateContainer}>
            <IconSymbol 
              name="book" 
              size={64} 
              color={Colors[colorScheme ?? 'light'].text + '80'} 
            />
            <ThemedText style={styles.emptyStateText}>
              {t('bookshelfEmpty')}
            </ThemedText>
            <ThemedText style={styles.emptyStateSubtext}>
              {t('bookshelfEmptySubtext')}
            </ThemedText>
            <TouchableOpacity 
              style={[
                styles.importBtnLarge, 
                { backgroundColor: Colors[colorScheme ?? 'light'].tint }
              ]} 
              onPress={importBook}
            >
              <ThemedText style={styles.importBtnText}>{t('importBookButton')}</ThemedText>
            </TouchableOpacity>
          </ThemedView>
        )}
      </ThemedView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 10,
  },
  importButton: {
    padding: 10,
  },
  bookList: {
    paddingVertical: 10,
  },
  bookItem: {
    width: '30%',
    margin: '1.66%',
    alignItems: 'center',
  },
  bookCover: {
    width: '100%',
    aspectRatio: 2/3,
    backgroundColor: '#e0e0e0',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  bookTypeLabel: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  bookTitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 16,
  },
  emptyStateSubtext: {
    fontSize: 14,
    marginTop: 8,
    marginBottom: 24,
    textAlign: 'center',
  },
  importBtnLarge: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  importBtnText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
