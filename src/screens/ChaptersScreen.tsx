import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, useColorScheme } from 'react-native';
import { CommonActions } from '@react-navigation/native';
import StorageService from '../services/StorageService';
import { STORAGE_KEYS } from '../utils/constants';
import { Chapter } from '../types';
import useSettings from '../hooks/useSettings';
import useI18n from '../i18n';

export default function ChaptersScreen({ route, navigation }: any) {
  const { bookId } = route.params;
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const { settings } = useSettings();
  const { t } = useI18n();

  const colorScheme = useColorScheme();
  const isDark = settings.theme === 'system' ? colorScheme === 'dark' : settings.theme === 'dark';
  const bgColor = isDark ? '#121212' : '#ffffff';
  const textColor = isDark ? '#e0e0e0' : '#333333';
  const borderColor = isDark ? '#333' : '#eee';

  useEffect(() => {
    loadChapters();
  }, [bookId]);

  const loadChapters = async () => {
    const data = await StorageService.getData(`${STORAGE_KEYS.CHAPTERS_PREFIX}${bookId}`);
    setChapters(data || []);
  };

  const handleChapterPress = (chapter: Chapter) => {
    navigation.dispatch((state: any) => {
      const routes = state.routes
        .filter((r: any) => r.name !== 'Chapters')
        .map((r: any) => r.name === 'Reader' ? { ...r, params: { bookId, chapterId: chapter.id } } : r);
      return CommonActions.reset({ ...state, routes, index: routes.length - 1 });
    });
  };

  const renderItem = ({ item }: { item: Chapter }) => (
    <TouchableOpacity style={[styles.item, { borderBottomColor: borderColor }]} onPress={() => handleChapterPress(item)}>
      <Text style={[styles.title, { color: textColor }]} numberOfLines={1}>
        {item.title}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <FlatList
        data={chapters}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={[styles.emptyText, { color: textColor }]}>{t('common.loading')}</Text>}
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
  title: {
    fontSize: 16,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 24,
  },
});
