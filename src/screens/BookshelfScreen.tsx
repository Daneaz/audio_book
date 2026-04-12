import React, { useState, useCallback, useMemo, useRef } from 'react';
import { Alert, View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Dimensions, Modal, TextInput, KeyboardAvoidingView, Platform, Image, ActivityIndicator, useColorScheme, Animated, Pressable } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const [modalMode, setModalMode] = useState<'rename' | 'rename-author' | 'cover' | null>(null);
  const [activeBook, setActiveBook] = useState<Book | null>(null);
  const [inputText, setInputText] = useState('');
  const [modalSaving, setModalSaving] = useState(false);
  const [menuBook, setMenuBook] = useState<Book | null>(null);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const { settings } = useSettings();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  const colorScheme = useColorScheme();
  const isDark = settings.theme === 'system' ? colorScheme === 'dark' : settings.theme === 'dark';
  const screenWidth = Dimensions.get('window').width;
  const horizontalPadding = 18;
  const columnGap = 16;
  const coverWidth = Math.floor((screenWidth - horizontalPadding * 2 - columnGap * 2) / 3);
  const coverHeight = Math.round(coverWidth * 1.48);

  const colors = useMemo(
    () => ({
      bg:           isDark ? '#0E0C0A' : '#FAF7F0',
      surface:      isDark ? '#1C1916' : '#F3ECE0',
      border:       isDark ? '#2A2520' : '#E0D4C0',
      accent:       isDark ? '#C4A96A' : '#A0621A',
      accentBg:     isDark ? 'rgba(196,169,106,0.1)'  : 'rgba(139,94,32,0.08)',
      accentBorder: isDark ? 'rgba(196,169,106,0.3)'  : 'rgba(139,94,32,0.25)',
      textPrimary:  isDark ? '#E8E0D0' : '#2C1A0E',
      textSub:      isDark ? '#6A5A44' : '#9A7A5A',
      iconBox:      isDark ? '#2A2520' : '#E8DCC8',
      deleteBox:    isDark ? '#2E1F1F' : '#FAE8E8',
      dotMenu:      isDark ? 'rgba(14,12,10,0.7)' : 'rgba(250,247,240,0.85)',
      fab:          isDark ? '#C4A96A' : '#2C1A0E',
      // legacy aliases
      text:         isDark ? '#E8E0D0' : '#2C1A0E',
      subText:      isDark ? '#6A5A44' : '#9A7A5A',
      shelf:        isDark ? '#1C1916' : '#F3ECE0',
      emptyCard:    isDark ? '#1C1916' : '#F3ECE0',
      emptyBorder:  isDark ? '#2A2520' : '#E0D4C0',
      deleteBg:     isDark ? 'rgba(14,12,10,0.7)' : 'rgba(250,247,240,0.85)',
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

  const showMenu = (book: Book) => {
    setMenuBook(book);
    slideAnim.setValue(0);
    fadeAnim.setValue(0);
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 1, tension: 65, friction: 11, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  };

  const closeMenu = (cb?: () => void) => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(() => {
      setMenuBook(null);
      cb?.();
    });
  };

  const openModal = (mode: 'rename' | 'rename-author' | 'cover', book: Book) => {
    setActiveBook(book);
    setInputText(mode === 'rename' ? book.title : mode === 'rename-author' ? (book.author || '') : '');
    setModalMode(mode);
  };

  const closeModal = () => {
    setModalMode(null);
    setActiveBook(null);
    setInputText('');
    setModalSaving(false);
  };

  const handleModalConfirm = async () => {
    if (!activeBook || !inputText.trim() || (modalMode !== 'rename' && modalMode !== 'rename-author')) return;
    setModalSaving(true);
    try {
      const updated = modalMode === 'rename'
        ? { ...activeBook, title: inputText.trim() }
        : { ...activeBook, author: inputText.trim() };
      await BookService.updateBook(updated);
      await loadBooks();
      closeModal();
    } catch {
      setModalSaving(false);
      Alert.alert(t('upload.errorTitle'));
    }
  };

  const handlePickLocalCover = async () => {
    if (!activeBook) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setModalSaving(true);
    try {
      await BookService.setCoverFromLocalUri(activeBook.id, result.assets[0].uri);
      await loadBooks();
      closeModal();
    } catch {
      setModalSaving(false);
      Alert.alert(t('bookshelf.coverError'));
    }
  };

  const handlePasteClipboardCover = async () => {
    if (!activeBook) return;
    const imageUri = await Clipboard.getImageAsync({ format: 'png' });
    if (imageUri?.data) {
      setModalSaving(true);
      try {
        const { documentDirectory, writeAsStringAsync, EncodingType } = await import('expo-file-system/legacy');
        const tmpPath = `${documentDirectory}clipboard_cover_tmp.png`;
        const base64Data = imageUri.data.replace(/^data:image\/\w+;base64,/, '');
        await writeAsStringAsync(tmpPath, base64Data, { encoding: EncodingType.Base64 });
        await BookService.setCoverFromLocalUri(activeBook.id, tmpPath);
        await loadBooks();
        closeModal();
      } catch {
        setModalSaving(false);
        Alert.alert(t('bookshelf.coverError'));
      }
      return;
    }

    const text = await Clipboard.getStringAsync();
    if (text && /^https?:\/\/.+/i.test(text.trim())) {
      setModalSaving(true);
      try {
        const { documentDirectory, downloadAsync } = await import('expo-file-system/legacy');
        const tmpPath = `${documentDirectory}clipboard_cover_tmp.png`;
        const result = await downloadAsync(text, tmpPath);
        if (result?.uri) {
          await BookService.setCoverFromLocalUri(activeBook.id, result.uri);
          await loadBooks();
          closeModal();
        } else {
          setModalSaving(false);
          Alert.alert(t('bookshelf.coverError'));
        }
      } catch {
        setModalSaving(false);
        Alert.alert(t('bookshelf.coverError'));
      }
      return;
    }

    Alert.alert(t('bookshelf.coverClipboardEmpty'));
  };

  const renderHeader = () => (
    <View style={styles.headerBlock}>
      <Text style={[styles.subtitle, { color: colors.textSub }]}>
        {t('bookshelf.subtitle')}
      </Text>
    </View>
  );

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
            {item.coverImageUri ? (
              <Image
                source={{ uri: item.coverImageUri }}
                style={{ width: coverWidth, height: coverHeight, borderRadius: 14, overflow: 'hidden' }}
                resizeMode="cover"
              />
            ) : (
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
            )}
          </View>
          <Text style={[styles.metaTitle, { color: colors.textPrimary }]} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={[styles.metaSubtitle, { color: colors.textSub }]} numberOfLines={1}>
            {item.totalChapters > 0 ? t('bookshelf.chapterCount', { count: item.totalChapters }) : t('bookshelf.pendingParse')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => showMenu(item)}
          style={[styles.deleteButton, { backgroundColor: colors.dotMenu }]}
        >
          <MaterialIcons name="more-horiz" size={18} color={colors.accent} />
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
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{t('bookshelf.emptyTitle')}</Text>
            <Text style={[styles.emptySubTitle, { color: colors.textSub }]}>{t('bookshelf.emptySubtitle')}</Text>
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
          contentContainerStyle={[styles.listContent, { paddingBottom: 120 + insets.bottom }]}
          ListHeaderComponent={
            <View>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.accent }]}>{t('bookshelf.sectionTitle')}</Text>
              </View>
            </View>
          }
          ItemSeparatorComponent={() => <View style={styles.rowSpacer} />}
          columnWrapperStyle={styles.columnWrapper}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textSub} />}
        />
      )}

      {books.length > 0 ? (
        <TouchableOpacity style={[styles.fab, { backgroundColor: colors.fab, bottom: 24 + insets.bottom }]} onPress={() => navigation.navigate('Upload')}>
          <MaterialIcons name="add" size={28} color="#FFF8EE" />
        </TouchableOpacity>
      ) : null}

      <Modal visible={menuBook !== null} transparent animationType="none" onRequestClose={() => closeMenu()}>
        <Animated.View style={[styles.menuOverlay, { opacity: fadeAnim }]}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => closeMenu()} />
          <Animated.View
            style={[
              styles.menuSheet,
              { backgroundColor: isDark ? '#1C1A18' : '#FDFCF9', paddingBottom: insets.bottom + 8 },
              { transform: [{ translateY: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [400, 0] }) }] },
            ]}
          >
            <View style={[styles.menuHandle, { backgroundColor: isDark ? '#3A3632' : '#DDD9D0' }]} />
            <View style={styles.menuHeader}>
              <View style={[styles.menuBookBadge, { backgroundColor: isDark ? '#2A2724' : '#F0EDE6' }]}>
                <MaterialIcons name="menu-book" size={14} color={isDark ? '#C4A96A' : '#8B6A2A'} />
              </View>
              <Text style={[styles.menuBookTitle, { color: isDark ? '#C4A96A' : '#6B4F1C' }]} numberOfLines={1}>
                {menuBook?.title}
              </Text>
            </View>
            <View style={[styles.menuGroup, { backgroundColor: isDark ? '#242220' : '#F7F5F0', borderColor: isDark ? '#332F2B' : '#E8E3D8' }]}>
              {([
                { icon: 'drive-file-rename-outline', label: t('bookshelf.rename'), onPress: () => closeMenu(() => openModal('rename', menuBook!)) },
                { icon: 'person-outline', label: t('bookshelf.renameAuthor'), onPress: () => closeMenu(() => openModal('rename-author', menuBook!)) },
                { icon: 'image', label: t('bookshelf.setCover'), onPress: () => closeMenu(() => openModal('cover', menuBook!)) },
              ] as const).map((item, idx, arr) => (
                <TouchableOpacity
                  key={item.label}
                  style={[styles.menuRow, idx < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: isDark ? '#332F2B' : '#E8E3D8' }]}
                  onPress={item.onPress}
                  activeOpacity={0.7}
                >
                  <View style={[styles.menuIconBox, { backgroundColor: isDark ? '#2E2B27' : '#EDE9DF' }]}>
                    <MaterialIcons name={item.icon} size={18} color={isDark ? '#B8A880' : '#7A5C28'} />
                  </View>
                  <Text style={[styles.menuRowLabel, { color: isDark ? '#E8E0D0' : '#3A2E1E' }]}>{item.label}</Text>
                  <MaterialIcons name="chevron-right" size={18} color={isDark ? '#4A4540' : '#C4BDB0'} />
                </TouchableOpacity>
              ))}
            </View>
            <View style={[styles.menuGroup, { backgroundColor: isDark ? '#242220' : '#F7F5F0', borderColor: isDark ? '#332F2B' : '#E8E3D8', marginTop: 10 }]}>
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => closeMenu(() => confirmDelete(menuBook!))}
                activeOpacity={0.7}
              >
                <View style={[styles.menuIconBox, { backgroundColor: isDark ? '#2E1F1F' : '#FAE8E8' }]}>
                  <MaterialIcons name="delete-outline" size={18} color="#D64040" />
                </View>
                <Text style={[styles.menuRowLabel, { color: '#D64040' }]}>{t('common.delete')}</Text>
                <MaterialIcons name="chevron-right" size={18} color={isDark ? '#4A4540' : '#C4BDB0'} />
              </TouchableOpacity>
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>

      <Modal visible={modalMode !== null} transparent animationType="fade" onRequestClose={closeModal}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              {modalMode === 'rename' ? t('bookshelf.renameTitle') : modalMode === 'rename-author' ? t('bookshelf.renameAuthorTitle') : t('bookshelf.coverTitle')}
            </Text>
            {(modalMode === 'rename' || modalMode === 'rename-author') ? (
              <>
                <TextInput
                  style={[styles.modalInput, { color: colors.textPrimary, borderColor: colors.border }]}
                  placeholder={modalMode === 'rename' ? t('bookshelf.renamePrompt') : t('bookshelf.renameAuthorPrompt')}
                  placeholderTextColor={colors.textSub}
                  value={inputText}
                  onChangeText={setInputText}
                  autoFocus
                  autoCorrect={false}
                  autoCapitalize="none"
                  returnKeyType="done"
                  onSubmitEditing={handleModalConfirm}
                />
                <View style={styles.modalActions}>
                  <TouchableOpacity onPress={closeModal} style={styles.modalBtn}>
                    <Text style={[styles.modalBtnText, { color: colors.textSub }]}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                  {modalSaving ? (
                    <ActivityIndicator size="small" color={colors.accent} style={styles.modalBtn} />
                  ) : (
                    <TouchableOpacity onPress={handleModalConfirm} style={styles.modalBtn} disabled={!inputText.trim()}>
                      <Text style={[styles.modalBtnText, { color: !inputText.trim() ? colors.textSub : colors.accent, fontWeight: '700' }]}>{t('common.ok')}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            ) : (
              <>
                {modalSaving ? (
                  <ActivityIndicator size="small" color={colors.accent} style={{ marginVertical: 20 }} />
                ) : (
                  <View style={styles.coverActionCol}>
                    <TouchableOpacity
                      style={[styles.coverActionBtn, { backgroundColor: colors.iconBox }]}
                      onPress={handlePickLocalCover}
                    >
                      <MaterialIcons name="photo-library" size={22} color={colors.accent} />
                      <Text style={[styles.coverActionText, { color: colors.textPrimary }]}>{t('bookshelf.coverPickLocal')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.coverActionBtn, { backgroundColor: colors.iconBox }]}
                      onPress={handlePasteClipboardCover}
                    >
                      <MaterialIcons name="content-paste" size={22} color={colors.accent} />
                      <Text style={[styles.coverActionText, { color: colors.textPrimary }]}>{t('bookshelf.coverPasteClipboard')}</Text>
                    </TouchableOpacity>
                  </View>
                )}
                <View style={styles.modalActions}>
                  <TouchableOpacity onPress={closeModal} style={styles.modalBtn}>
                    <Text style={[styles.modalBtnText, { color: colors.textSub }]}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    width: '80%',
    borderRadius: 18,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 14,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 18,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  modalBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 52,
    alignItems: 'center',
  },
  modalBtnText: {
    fontSize: 15,
  },
  coverActionCol: {
    gap: 10,
    marginTop: 4,
    marginBottom: 18,
  },
  coverActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  coverActionText: {
    fontSize: 15,
    fontWeight: '500',
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.52)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 12,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 20,
  },
  menuHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    marginBottom: 14,
  },
  menuBookBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuBookTitle: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
    flex: 1,
  },
  menuGroup: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
  },
  menuIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuRowLabel: {
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
  },
});
