import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import StorageService from '../services/StorageService';
import { STORAGE_KEYS } from '../utils/constants';
import { Chapter } from '../types';

export default function ChaptersScreen({ route, navigation }: any) {
  const { bookId } = route.params;
  const [chapters, setChapters] = useState<Chapter[]>([]);

  useEffect(() => {
    loadChapters();
  }, [bookId]);

  const loadChapters = async () => {
    const data = await StorageService.getData(`${STORAGE_KEYS.CHAPTERS_PREFIX}${bookId}`);
    setChapters(data || []);
  };

  const handleChapterPress = (chapter: Chapter) => {
    // Navigate to Reader with specific chapter
    navigation.navigate('Reader', { bookId, chapterId: chapter.id });
  };

  const renderItem = ({ item }: { item: Chapter }) => (
    <TouchableOpacity style={styles.item} onPress={() => handleChapterPress(item)}>
      <Text style={styles.title} numberOfLines={1}>
        {item.title}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={chapters}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
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
});
