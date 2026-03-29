import React, { useState, useCallback, useMemo } from 'react';
import { Alert, View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Dimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import BookService from '../services/BookService';
import { Book } from '../types';
import useSettings from '../hooks/useSettings';
import useI18n from '../i18n';

const COVER_PALETTES = [
  ['#F7C873', '#D88A46', '#7A3B1C'],
  ['#A8C7FF', '#4F7BFF', '#1D2F8E'],
  ['#B7E4C7', '#4DAA72', '#1D5B3A'],
  ['#F6B3C7', '#D85E89', '#7A2146'],
  ['#D5C5FF', '#8B67E8', '#41208B'],
  ['#BEE7E8', '#4BA3A6', '#155B60'],
];

function getCoverPalette(bookId: string) {
  const code = bookId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return COVER_PALETTES[code % COVER_PALETTES.length];
}

function getCoverLabel(title: string) {
  const compact = title.replace(/\s+/g, '');
  return compact.slice(0, Math.min(compact.length, 18));
}

export default function BookshelfScreen({ navigation }: any) {
  const [books, setBooks] = useState<Book[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const { settings } = useSettings();
  const { t } = useI18n();

  const isDark = settings.theme === 'dark';
  const screenWidth = Dimensions.get('window').width;
  const horizontalPadding = 18;
  const columnGap = 16;
  const coverWidth = Math.floor((screenWidth - horizontalPadding * 2 - columnGap * 2) / 3);
  const coverHeight = Math.round(coverWidth * 1.48);

  const colors = useMemo(
    () => ({
      bg: isDark ? '#121212' : '#f5f5f5',
      shelf: isDark ? '#1E1E1E' : '#ffffff',
      shelfEdge: isDark ? '#000000' : '#d7d7d7',
      text: isDark ? '#e0e0e0' : '#333333',
      subText: isDark ? '#aaaaaa' : '#666666',
      fab: '#1E88E5',
      emptyCard: isDark ? '#1E1E1E' : '#ffffff',
      emptyBorder: isDark ? '#2d2d2d' : '#e3e3e3',
      deleteBg: isDark ? 'rgba(18, 18, 18, 0.82)' : 'rgba(255, 255, 255, 0.94)',
    }),
    [isDark]
  );

  const sortedBooks = useMemo(
    () => [...books].sort((a, b) => new Date(b.lastReadAt || b.createdAt).getTime() - new Date(a.lastReadAt || a.createdAt).getTime()),
    [books]
  );

  const loadBooks = async () => {
    const data = await BookService.getBooks();
    setBooks(data);
  };

  useFocusEffect(
    useCallback(() => {
      loadBooks();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadBooks();
    setRefreshing(false);
  };

  const handleDelete = async (bookId: string) => {
    await BookService.removeBook(bookId);
    loadBooks();
  };

  const confirmDelete = (book: Book) => {
    Alert.alert(
      t('bookshelf.deleteTitle'),
      t('bookshelf.deleteMessage', { title: book.title }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.delete'), style: 'destructive', onPress: () => handleDelete(book.id) },
      ]
    );
  };

  const renderHeader = () => (
    <View style={styles.headerBlock}>
      <Text style={[styles.subtitle, { color: colors.subText }]}>
        {t('bookshelf.subtitle')}
      </Text>
    </View>
  );

  const renderShelf = () => <View style={[styles.shelf, { backgroundColor: colors.shelf, shadowColor: colors.shelfEdge }]} />;

  const renderItem = ({ item, index }: { item: Book; index: number }) => {
    const palette = getCoverPalette(item.id);
    const isRowEnd = index % 3 === 2;

    return (
      <View style={[styles.bookSlot, { width: coverWidth, marginRight: isRowEnd ? 0 : columnGap }]}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => navigation.navigate('Reader', { bookId: item.id })}
          style={styles.bookTouchArea}
        >
          <View
            style={[
              styles.coverShadow,
              {
                width: coverWidth,
                height: coverHeight,
                shadowColor: isDark ? '#000' : palette[2],
              },
            ]}
          >
            <View style={[styles.cover, { backgroundColor: palette[0] }]}>
              <View style={[styles.coverSpine, { backgroundColor: palette[2] }]} />
              <View style={[styles.coverBand, { backgroundColor: palette[1] }]} />
              <Text style={[styles.coverTitle, { color: '#FFF8EE' }]} numberOfLines={4}>
                {getCoverLabel(item.title)}
              </Text>
              <Text style={[styles.coverAuthor, { color: 'rgba(255, 248, 238, 0.76)' }]} numberOfLines={1}>
                {item.author || 'Unknown'}
              </Text>
            </View>
          </View>
          <Text style={[styles.metaTitle, { color: colors.text }]} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={[styles.metaSubtitle, { color: colors.subText }]} numberOfLines={1}>
            {item.totalChapters > 0 ? t('bookshelf.chapterCount', { count: item.totalChapters }) : t('bookshelf.pendingParse')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => confirmDelete(item)}
          style={[styles.deleteButton, { backgroundColor: colors.deleteBg }]}
        >
          <MaterialIcons name="delete-outline" size={18} color={isDark ? '#D6DCE6' : '#6F6254'} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {books.length === 0 ? (
        <View style={styles.emptyWrap}>
          {renderHeader()}
          <View style={[styles.emptyCard, { backgroundColor: colors.emptyCard, borderColor: colors.emptyBorder }]}>
            <View style={styles.emptyShelfPreview}>
              <View style={[styles.emptyBook, { backgroundColor: '#D88A46' }]} />
              <View style={[styles.emptyBookTall, { backgroundColor: '#4F7BFF' }]} />
              <View style={[styles.emptyBook, { backgroundColor: '#4DAA72' }]} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('bookshelf.emptyTitle')}</Text>
            <Text style={[styles.emptySubTitle, { color: colors.subText }]}>{t('bookshelf.emptySubtitle')}</Text>
            <TouchableOpacity style={[styles.emptyButton, { backgroundColor: colors.fab }]} onPress={() => navigation.navigate('Upload')}>
              <Text style={styles.emptyButtonText}>{t('bookshelf.uploadButton')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <FlatList
          data={sortedBooks}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          numColumns={3}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('bookshelf.sectionTitle')}</Text>
              </View>
              {renderShelf()}
            </View>
          }
          ItemSeparatorComponent={() => <View style={styles.rowSpacer} />}
          columnWrapperStyle={styles.columnWrapper}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.subText} />}
        />
      )}

      {books.length > 0 ? (
        <TouchableOpacity style={[styles.fab, { backgroundColor: colors.fab }]} onPress={() => navigation.navigate('Upload')}>
          <MaterialIcons name="add" size={28} color="#FFF8EE" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 120,
  },
  headerBlock: {
    marginBottom: 18,
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '700',
  },
  sectionHint: {
    fontSize: 13,
  },
  shelf: {
    height: 10,
    borderRadius: 10,
    marginBottom: 18,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 3,
  },
  columnWrapper: {
    alignItems: 'flex-start',
  },
  rowSpacer: {
    height: 22,
  },
  bookSlot: {
    position: 'relative',
  },
  bookTouchArea: {
    alignItems: 'flex-start',
  },
  coverShadow: {
    borderRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 7,
    marginBottom: 12,
  },
  cover: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    paddingTop: 18,
    paddingHorizontal: 14,
    paddingBottom: 16,
    justifyContent: 'space-between',
  },
  coverSpine: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 10,
  },
  coverBand: {
    position: 'absolute',
    top: 18,
    right: -10,
    width: 90,
    height: 90,
    borderRadius: 45,
    opacity: 0.55,
  },
  coverTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    marginTop: 22,
    marginLeft: 4,
    marginRight: 4,
  },
  coverAuthor: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginLeft: 4,
  },
  metaTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
    marginBottom: 4,
  },
  metaSubtitle: {
    fontSize: 12,
  },
  deleteButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    position: 'absolute',
    right: 22,
    bottom: 24,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 8,
  },
  emptyWrap: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 32,
  },
  emptyCard: {
    marginTop: 8,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingVertical: 28,
    alignItems: 'center',
  },
  emptyShelfPreview: {
    width: '100%',
    height: 130,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    marginBottom: 22,
  },
  emptyBook: {
    width: 54,
    height: 92,
    borderRadius: 12,
    marginHorizontal: 8,
  },
  emptyBookTall: {
    width: 62,
    height: 110,
    borderRadius: 12,
    marginHorizontal: 8,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySubTitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 22,
  },
  emptyButton: {
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 999,
  },
  emptyButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
