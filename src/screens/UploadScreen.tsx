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

  const isDark = settings.theme === 'dark';

  const c = useMemo(
    () => ({
      bg: isDark ? '#121212' : '#f0f4f8',
      card: isDark ? '#1E1E1E' : '#ffffff',
      cardBorder: isDark ? '#2a2a2a' : '#e8edf2',
      text: isDark ? '#e0e0e0' : '#1a1a2e',
      subText: isDark ? '#888888' : '#888888',
      iconLocalBg: isDark ? '#1a2d42' : '#e8f1fb',
      iconWifiBg: isDark ? '#1a2d1e' : '#e8f5e9',
      urlBox: isDark ? '#0d1f10' : '#f0faf2',
      urlBorder: isDark ? '#1e4025' : '#c3e6cb',
      wifiActiveBorder: isDark ? '#2e6e3a' : '#81c784',
      divider: isDark ? '#2a2a2a' : '#f0f0f0',
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
      const newBook = await BookService.addBook(fileUri, fileName);
      const chapters = await ChapterService.parseChapters(newBook.id, newBook.filePath);
      newBook.totalChapters = chapters.length;
      await BookService.updateBook(newBook);
      await StorageService.storeData(`${STORAGE_KEYS.CHAPTERS_PREFIX}${newBook.id}`, chapters);
      return true;
    } catch {
      return false;
    }
  };

  const handleLocalPick = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'text/plain',
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

    WifiServerService.start(
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
        <View style={[styles.iconCircle, { backgroundColor: c.iconLocalBg }]}>
          <MaterialIcons name="folder-open" size={22} color="#1E88E5" />
        </View>
        <View style={styles.cardBody}>
          <Text style={[styles.cardTitle, { color: c.text }]}>{t('upload.localTitle')}</Text>
          <Text style={[styles.cardDesc, { color: c.subText }]}>{t('upload.localDesc')}</Text>
        </View>
        {localLoading ? (
          <ActivityIndicator size="small" color="#1E88E5" />
        ) : (
          <MaterialIcons name="chevron-right" size={20} color={c.subText} />
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
          <View style={[styles.iconCircle, { backgroundColor: c.iconWifiBg }]}>
            {wifiStarting ? (
              <ActivityIndicator size="small" color="#43A047" />
            ) : (
              <MaterialIcons name="wifi" size={22} color={wifiActive ? '#43A047' : '#1E88E5'} />
            )}
          </View>
          <View style={styles.cardBody}>
            <Text style={[styles.cardTitle, { color: c.text }]}>{t('upload.wifiTitle')}</Text>
            <Text style={[styles.cardDesc, { color: c.subText }]}>{t('upload.wifiDesc')}</Text>
          </View>
          {wifiActive ? (
            <View style={styles.runningBadge}>
              <View style={styles.dot} />
              <Text style={styles.runningText}>{t('upload.wifiRunning')}</Text>
            </View>
          ) : (
            <MaterialIcons name="chevron-right" size={20} color={c.subText} />
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
                style={[styles.urlText, { color: '#43A047' }]}
              />
              <TouchableOpacity onPress={handleShareUrl} style={styles.shareBtn} activeOpacity={0.7}>
                <MaterialIcons name="share" size={18} color="#43A047" />
              </TouchableOpacity>
            </View>

            {receivedCount > 0 && (
              <View style={styles.receivedRow}>
                <MaterialIcons name="check-circle" size={14} color="#43A047" />
                <Text style={styles.receivedText}>
                  {' '}
                  {t('upload.wifiReceived').replace('{count}', String(receivedCount))}
                </Text>
              </View>
            )}

            <TouchableOpacity style={styles.stopBtn} onPress={handleWifiStop} activeOpacity={0.7}>
              <MaterialIcons name="stop-circle" size={16} color="#e53935" />
              <Text style={styles.stopText}>{t('upload.wifiStop')}</Text>
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
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#43A047',
    marginRight: 5,
  },
  runningText: {
    fontSize: 12,
    color: '#43A047',
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
    borderColor: '#ffcdd2',
    backgroundColor: '#fff5f5',
  },
  stopText: {
    fontSize: 13,
    color: '#e53935',
    marginLeft: 4,
    fontWeight: '500',
  },
});
