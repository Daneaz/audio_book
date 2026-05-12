import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, useColorScheme } from 'react-native';
import { CommonActions } from '@react-navigation/native';
import StorageService from '../services/StorageService';
import { STORAGE_KEYS } from '../utils/constants';
import { Chapter } from '../types';
import useSettings from '../hooks/useSettings';
import useI18n from '../i18n';

const ITEM_HEIGHT = 53; // paddingVertical(16*2) + fontSize:16 line height (~21) + hairline
const LIST_PADDING = 16;

export default function ChaptersScreen({ route, navigation }: any) {
  const { bookId, currentChapterId } = route.params;
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const { settings } = useSettings();
  const { t } = useI18n();
  const flatListRef = useRef<FlatList>(null);
  const hasScrolled = useRef(false);

  const colorScheme = useColorScheme();
  const isDark = settings.theme === 'system' ? colorScheme === 'dark' : settings.theme === 'dark';
  const bgColor = isDark ? '#121212' : '#ffffff';
  const textColor = isDark ? '#e0e0e0' : '#333333';
  const borderColor = isDark ? '#333' : '#eee';
  const highlightBg = isDark ? '#2a3a2a' : '#e8f5e9';
  const highlightText = isDark ? '#81c784' : '#2e7d32';

  useEffect(() => {
    loadChapters();
  }, [bookId]);

  const loadChapters = async () => {
    const data = await StorageService.getData(`${STORAGE_KEYS.CHAPTERS_PREFIX}${bookId}`);
    setChapters(data || []);
  };

  useEffect(() => {
    if (!currentChapterId || chapters.length === 0 || hasScrolled.current) return;
    const index = chapters.findIndex(c => c.id === currentChapterId);
    if (index === -1) return;
    hasScrolled.current = true;
    setTimeout(() => {
      flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
    }, 100);
  }, [chapters, currentChapterId]);

  const handleChapterPress = (chapter: Chapter) => {
    navigation.dispatch((state: any) => {
      const routes = state.routes
        .filter((r: any) => r.name !== 'Chapters')
        .map((r: any) => r.name === 'Reader' ? { ...r, params: { bookId, chapterId: chapter.id } } : r);
      return CommonActions.reset({ ...state, routes, index: routes.length - 1 });
    });
  };

  const renderItem = ({ item }: { item: Chapter }) => {
    const isCurrent = item.id === currentChapterId;
    return (
      <TouchableOpacity
        style={[styles.item, { borderBottomColor: borderColor }, isCurrent && { backgroundColor: highlightBg }]}
        onPress={() => handleChapterPress(item)}
      >
        <Text
          style={[styles.title, { color: isCurrent ? highlightText : textColor }, isCurrent && styles.currentTitle]}
          numberOfLines={1}
        >
          {item.title}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <FlatList
        ref={flatListRef}
        data={chapters}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={[styles.emptyText, { color: textColor }]}>{t('common.loading')}</Text>}
        getItemLayout={(_data, index) => ({
          length: ITEM_HEIGHT,
          offset: LIST_PADDING + ITEM_HEIGHT * index,
          index,
        })}
        onScrollToIndexFailed={(info) => {
          flatListRef.current?.scrollToOffset({ offset: LIST_PADDING + ITEM_HEIGHT * info.index, animated: true });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  list: {
    padding: 16,
  },
  item: {
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
  title: {
    fontSize: 16,
  },
  currentTitle: {
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 24,
  },
});
