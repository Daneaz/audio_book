import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Share,
  TextInput,
  ScrollView,
  useColorScheme,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import BookService from '../services/BookService';
import ChapterService from '../services/ChapterService';
import StorageService from '../services/StorageService';
import WifiServerService, { WIFI_SERVER_PORT } from '../services/WifiServerService';
import { STORAGE_KEYS } from '../utils/constants';
import useSettings from '../hooks/useSettings';
import useI18n from '../i18n';

export default function UploadScreen({ navigation }: any) {
  const [localLoading, setLocalLoading] = useState(false);
  const [wifiActive, setWifiActive] = useState(false);
  const [wifiStarting, setWifiStarting] = useState(false);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [receivedCount, setReceivedCount] = useState(0);
  const { settings } = useSettings();
  const { t, language } = useI18n();
  const insets = useSafeAreaInsets();

  const colorScheme = useColorScheme();
  const isDark = settings.theme === 'system' ? colorScheme === 'dark' : settings.theme === 'dark';

  const WIFI_GREEN = '#5A9E5A';

  const c = useMemo(
    () => ({
      bg:          isDark ? '#0E0C0A' : '#FAF7F0',
      card:        isDark ? '#1C1916' : '#F3ECE0',
      cardBorder:  isDark ? '#2A2520' : '#E0D4C0',
      text:        isDark ? '#E8E0D0' : '#2C1A0E',
      subText:     isDark ? '#6A5A44' : '#9A7A5A',
      accent:      isDark ? '#C4A96A' : '#A0621A',
      iconBox:     isDark ? '#2A2520' : '#E8DCC8',
      urlBox:      isDark ? '#0A0806' : '#EFF8EE',
      urlBorder:   isDark ? '#1E3A20' : '#B8DDB5',
      divider:     isDark ? '#2A2520' : '#E0D4C0',
      wifiActive:  isDark ? '#1E3A20' : '#D0EED0',
      chevron:     isDark ? '#3A3028' : '#C0A880',
      wifiActiveBorder: isDark ? '#2E6E3A' : '#81C784',
    }),
    [isDark],
  );

  // Stop server when navigating away
  useFocusEffect(
    useCallback(() => {
      return () => {
        WifiServerService.stop();
        setWifiActive(false);
        setServerUrl(null);
      };
    }, []),
  );

  const processFile = async (fileName: string, fileUri: string): Promise<boolean> => {
    try {
      const lower = fileName.toLowerCase();
      if (lower.endsWith('.epub')) {
        const { book } = await BookService.addEpubBook(fileUri, fileName);
        if (!book) return false;
        return true;
      }
      if (!lower.endsWith('.txt')) return false;
      const newBook = await BookService.addBook(fileUri, fileName);
      const chapters = await ChapterService.parseChapters(newBook.id, newBook.filePath);
      newBook.totalChapters = chapters.length;
      await BookService.updateBook(newBook);
      await StorageService.storeData(`${STORAGE_KEYS.CHAPTERS_PREFIX}${newBook.id}`, chapters);
      return true;
    } catch (e: any) {
      console.error('[processFile] error:', e);
      Alert.alert('导入失败（调试）', String(e?.message ?? e));
      return false;
    }
  };

  const handleLocalPick = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets[0]) return;
      const file = result.assets[0];

      setLocalLoading(true);
      const ok = await processFile(file.name, file.uri);
      setLocalLoading(false);

      if (ok) {
        Alert.alert(t('upload.successTitle'), t('upload.successMessage'), [
          { text: t('common.ok'), onPress: () => navigation.goBack() },
        ]);
      } else {
        Alert.alert(t('upload.errorTitle'), t('upload.errorMessage'));
      }
    } catch {
      setLocalLoading(false);
      Alert.alert(t('upload.errorTitle'), t('upload.errorMessage'));
    }
  };

  const handleWifiStart = async () => {
    setWifiStarting(true);
    const ip = await WifiServerService.getLocalIp();
    if (!ip) {
      setWifiStarting(false);
      Alert.alert(t('upload.wifiNoNetwork'));
      return;
    }

    const url = `http://${ip}:${WIFI_SERVER_PORT}`;
    setServerUrl(url);
    setReceivedCount(0);

    const started = await WifiServerService.start(
      async (fileName, tempUri) => {
        setReceivedCount(prev => prev + 1);
        const ok = await processFile(fileName, tempUri);
        if (ok) {
          Alert.alert(t('upload.successTitle'), t('upload.successMessage'));
        } else {
          Alert.alert(t('upload.errorTitle'), t('upload.errorMessage'));
        }
      },
      language,
      () => {
        setWifiActive(false);
        setServerUrl(null);
        Alert.alert(t('upload.errorTitle'), t('upload.wifiNoNetwork'));
      },
    );

    setWifiStarting(false);
    if (!started) {
      setServerUrl(null);
      Alert.alert(t('upload.errorTitle'), t('upload.wifiNoNetwork'));
      return;
    }
    setWifiActive(true);
  };

  const handleWifiStop = () => {
    WifiServerService.stop();
    setWifiActive(false);
    setServerUrl(null);
  };

  const handleShareUrl = async () => {
    if (!serverUrl) return;
    await Share.share({ message: serverUrl });
  };

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: c.bg }]}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: c.text }]}>{t('upload.title')}</Text>
        <Text style={[styles.subtitle, { color: c.subText }]}>{t('upload.subtitle')}</Text>
      </View>

      {/* Local file card */}
      <TouchableOpacity
        style={[styles.card, styles.cardRow, { backgroundColor: c.card, borderColor: c.cardBorder }]}
        onPress={handleLocalPick}
        disabled={localLoading}
        activeOpacity={0.7}
      >
        <View style={[styles.iconCircle, { backgroundColor: c.iconBox }]}>
          <MaterialIcons name="folder-open" size={22} color={c.accent} />
        </View>
        <View style={styles.cardBody}>
          <Text style={[styles.cardTitle, { color: c.text }]}>{t('upload.localTitle')}</Text>
          <Text style={[styles.cardDesc, { color: c.subText }]}>{t('upload.localDesc')}</Text>
        </View>
        {localLoading ? (
          <ActivityIndicator size="small" color={c.accent} />
        ) : (
          <MaterialIcons name="chevron-right" size={20} color={c.chevron} />
        )}
      </TouchableOpacity>

      {/* WiFi card */}
      <View
        style={[
          styles.card,
          styles.wifiCard,
          {
            backgroundColor: c.card,
            borderColor: wifiActive ? c.wifiActiveBorder : c.cardBorder,
          },
        ]}
      >
        {/* Card header row */}
        <TouchableOpacity
          style={styles.cardRow}
          onPress={wifiActive ? handleWifiStop : handleWifiStart}
          disabled={wifiStarting}
          activeOpacity={0.7}
        >
          <View style={[styles.iconCircle, { backgroundColor: wifiActive ? (isDark ? '#1A2A1A' : '#D8EED8') : c.iconBox }]}>
            {wifiStarting ? (
              <ActivityIndicator size="small" color={WIFI_GREEN} />
            ) : (
              <MaterialIcons name="wifi" size={22} color={wifiActive ? WIFI_GREEN : c.accent} />
            )}
          </View>
          <View style={styles.cardBody}>
            <Text style={[styles.cardTitle, { color: c.text }]}>{t('upload.wifiTitle')}</Text>
            <Text style={[styles.cardDesc, { color: c.subText }]}>{t('upload.wifiDesc')}</Text>
          </View>
          {wifiActive ? (
            <View style={[styles.runningBadge, { backgroundColor: c.wifiActive }]}>
              <View style={[styles.dot, { backgroundColor: WIFI_GREEN }]} />
              <Text style={[styles.runningText, { color: WIFI_GREEN }]}>{t('upload.wifiRunning')}</Text>
            </View>
          ) : (
            <MaterialIcons name="chevron-right" size={20} color={c.chevron} />
          )}
        </TouchableOpacity>

        {/* Expanded section when active */}
        {wifiActive && serverUrl && (
          <View style={[styles.wifiExpanded, { borderTopColor: c.divider }]}>
            <Text style={[styles.instruction, { color: c.subText }]}>
              {t('upload.wifiInstruction')}
            </Text>

            <View style={[styles.urlRow, { backgroundColor: c.urlBox, borderColor: c.urlBorder }]}>
              <TextInput
                value={serverUrl}
                editable={false}
                selectTextOnFocus
                style={[styles.urlText, { color: WIFI_GREEN }]}
              />
              <TouchableOpacity onPress={handleShareUrl} style={styles.shareBtn} activeOpacity={0.7}>
                <MaterialIcons name="share" size={18} color={WIFI_GREEN} />
              </TouchableOpacity>
            </View>

            {receivedCount > 0 && (
              <View style={styles.receivedRow}>
                <MaterialIcons name="check-circle" size={14} color={WIFI_GREEN} />
                <Text style={[styles.receivedText, { color: WIFI_GREEN }]}>
                  {' '}
                  {t('upload.wifiReceived').replace('{count}', String(receivedCount))}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.stopBtn, {
                borderColor: 'rgba(214,64,64,0.2)',
                backgroundColor: isDark ? '#1A0A0A' : '#FFF5F5',
              }]}
              onPress={handleWifiStop}
              activeOpacity={0.7}
            >
              <MaterialIcons name="stop-circle" size={16} color="#D64040" />
              <Text style={[styles.stopText, { color: '#D64040' }]}>{t('upload.wifiStop')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
    marginTop: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 14,
    overflow: 'hidden',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  wifiCard: {},
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  cardDesc: {
    fontSize: 13,
    marginTop: 2,
  },
  runningBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  runningText: {
    fontSize: 12,
    fontWeight: '600',
  },
  wifiExpanded: {
    paddingHorizontal: 16,
    paddingBottom: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  instruction: {
    fontSize: 13,
    marginBottom: 10,
    marginTop: 4,
  },
  urlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  urlText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  shareBtn: {
    padding: 4,
    marginLeft: 8,
  },
  receivedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  receivedText: {
    fontSize: 13,
    color: '#43A047',
    fontWeight: '500',
  },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  stopText: {
    fontSize: 13,
    marginLeft: 4,
    fontWeight: '500',
  },
});
