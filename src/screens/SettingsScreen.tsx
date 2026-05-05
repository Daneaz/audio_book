import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity, ScrollView, ActivityIndicator, useColorScheme, Platform, AppState, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import useSettings from '../hooks/useSettings';
import * as Speech from 'expo-speech';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import { FONT_PRESET_OPTIONS, getFontFamilyForPreset } from '../utils/fontUtils';
import { VoiceEntry, mergeWithInstalledVoices, prependXfyunVoices, isXfyunVoice } from '../utils/voiceUtils';
import { promptThenOpenSystemSettings } from '../utils/systemSettings';
import useI18n from '../i18n';
import useMembership from '../hooks/useMembership';
import * as FileSystem from 'expo-file-system/legacy';
import { LocalTtsProvider } from '../services/tts/LocalTtsProvider';
import { XfyunTtsProvider } from '../services/tts/XfyunTtsProvider';
import { VoicePickerModal } from '../components/VoicePickerModal';

const ALLOWED_ENGLISH_VOICE_NAMES = new Set([
  'Daniel',
  'Karen',
  'Moira',
  'Rishi',
  'Samantha',
  'Tessa',
]);

export default function SettingsScreen({ navigation }: any) {
  const { settings, updateSettings, loading } = useSettings();
  const { isActive, isTrial, expiresAt } = useMembership();
  const { t, language } = useI18n();
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voices, setVoices] = useState<VoiceEntry[]>([]);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [showFonts, setShowFonts] = useState(false);
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const XFYUN_CACHE_DIR = `${FileSystem.cacheDirectory}xfyun_tts/`;
  const [xfyunCacheSize, setXfyunCacheSize] = useState(0);

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const checkCacheSize = useCallback(async () => {
    const calcDirSize = async (dir: string): Promise<number> => {
      const info = await FileSystem.getInfoAsync(dir);
      if (!info.exists) return 0;
      const entries = await FileSystem.readDirectoryAsync(dir);
      let total = 0;
      for (const entry of entries) {
        const entryPath = `${dir}${entry}`;
        const entryInfo = await FileSystem.getInfoAsync(entryPath, { size: true });
        if (!entryInfo.exists) continue;
        if (entryInfo.isDirectory) {
          total += await calcDirSize(`${entryPath}/`);
        } else if ('size' in entryInfo) {
          total += entryInfo.size ?? 0;
        }
      }
      return total;
    };
    setXfyunCacheSize(await calcDirSize(XFYUN_CACHE_DIR));
  }, [XFYUN_CACHE_DIR]);

  useEffect(() => { checkCacheSize(); }, [checkCacheSize]);

  const clearVoiceCache = async () => {
    try {
      const size = xfyunCacheSize;
      await FileSystem.deleteAsync(XFYUN_CACHE_DIR, { idempotent: true });
      setXfyunCacheSize(0);
      Alert.alert(t('settings.xfyunCacheCleared'), formatBytes(size));
    } catch (e) {
      Alert.alert('Error', 'Failed to clear cache');
    }
  };

  const loadVoices = useCallback(async () => {
    setVoicesLoading(true);
    try {
      const available = await Speech.getAvailableVoicesAsync();
      if (cancelledRef.current) return;

      const raw = (available || []).map((v: any) => ({
        identifier: String(v.identifier),
        name: typeof v.name === 'string' ? v.name : undefined,
        language: typeof v.language === 'string' ? v.language : undefined,
        quality: typeof v.quality === 'string' ? v.quality : undefined,
      }));

      if (Platform.OS === 'ios') {
        const zhInstalled = raw.filter(v => {
          const lang = (v.language || '').toLowerCase();
          return lang.startsWith('zh') || lang.startsWith('en');
        });
        setVoices(mergeWithInstalledVoices(zhInstalled));
      } else {
        const normalized = raw
          .filter(v => {
            if (!v.identifier) return false;
            const lang = (v.language || '').toLowerCase();
            if (lang.startsWith('zh')) return true;
            if (lang.startsWith('en')) return v.name ? ALLOWED_ENGLISH_VOICE_NAMES.has(v.name) : false;
            return false;
          })
          .map(v => ({
            identifier: v.identifier,
            name: v.name || v.identifier,
            language: v.language || '',
            quality: (v.quality === 'Premium' ? 'Premium' : v.quality === 'Enhanced' ? 'Enhanced' : 'Default') as 'Default' | 'Enhanced' | 'Premium' | 'Cloud',
            installed: true,
          }));
        setVoices(prependXfyunVoices(normalized));
      }
    } finally {
      if (!cancelledRef.current) setVoicesLoading(false);
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    loadVoices();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') loadVoices();
    });
    return () => {
      cancelledRef.current = true;
      Speech.stop();
      sub.remove();
      previewProviderRef.current?.stop().catch(() => {});
      previewProviderRef.current = null;
    };
  }, [loadVoices]);

  const openVoiceSettings = useCallback(() => {
    promptThenOpenSystemSettings(t('settings.voiceHintIos'), t('common.cancel'), t('common.ok'));
  }, [t]);

  const previewProviderRef = useRef<LocalTtsProvider | XfyunTtsProvider | null>(null);

  const previewVoice = async (voiceId: string, voiceLanguage?: string) => {
    const normalizedLanguage = (voiceLanguage || '').toLowerCase();
    const previewText = normalizedLanguage.startsWith('zh') ? t('settings.voicePreviewZh') : t('settings.voicePreviewEn');
    const speechLanguage = normalizedLanguage.startsWith('zh') ? 'zh-CN' : 'en-US';

    if (previewProviderRef.current) {
      await previewProviderRef.current.stop();
    }

    const provider = isXfyunVoice(voiceId)
      ? new XfyunTtsProvider(voiceId)
      : new LocalTtsProvider(voiceId === 'default' ? undefined : voiceId);

    previewProviderRef.current = provider;
    setPreviewingVoiceId(voiceId);

    provider.speak(previewText, {
      language: speechLanguage,
      rate: settings.speechRate,
      onDone: () => setPreviewingVoiceId(current => current === voiceId ? null : current),
      onStopped: () => setPreviewingVoiceId(current => current === voiceId ? null : current),
      onError: () => setPreviewingVoiceId(current => current === voiceId ? null : current),
    });
  };

  const selectedVoice = settings.voiceType;
  const voiceDefaultLang = language === 'zh' ? 'zh-CN' : 'en-US';
  const settingsFontOptions = useMemo(
    () => FONT_PRESET_OPTIONS.filter((option) => option.id !== 'system'),
    []
  );
  const selectedFontLabel = useMemo(
    () => {
      switch (settings.fontPreset) {
        case 'hei': return t('settings.fontHei');
        case 'kai': return t('settings.fontKai');
        case 'song': return t('settings.fontSong');
        case 'mashan': return t('settings.fontMashan');
        default: return t('settings.fontHei');
      }
    },
    [settings.fontPreset, t]
  );
  const selectedVoiceLabel = useMemo(() => {
    if (!selectedVoice || selectedVoice === 'default') return t('common.default');
    const v = voices.find((x) => x.identifier === selectedVoice);
    if (!v) return selectedVoice;
    const qualityLabel = v.quality === 'Cloud' ? ` · ${t('voice.cloud')}` : v.quality === 'Premium' ? ` · ${t('voice.qualityPremium')}` : v.quality === 'Enhanced' ? ` · ${t('voice.qualityEnhanced')}` : '';
    return `${v.name}${qualityLabel}`;
  }, [selectedVoice, t, voices]);
  const fontOptionMeta = useMemo(
    () => ({
      hei: { label: t('settings.fontHei'), description: t('settings.fontHeiDesc') },
      kai: { label: t('settings.fontKai'), description: t('settings.fontKaiDesc') },
      song: { label: t('settings.fontSong'), description: t('settings.fontSongDesc') },
      mashan: { label: t('settings.fontMashan'), description: t('settings.fontMashanDesc') },
    }),
    [t]
  );
  const selectedFontFamily = getFontFamilyForPreset(settings.fontPreset);

  const colorScheme = useColorScheme();
  const isDark = settings.theme === 'system' ? colorScheme === 'dark' : settings.theme === 'dark';

  const sc = useMemo(() => ({
    bg:          isDark ? '#0E0C0A' : '#FAF7F0',
    surface:     isDark ? '#1C1916' : '#F3ECE0',
    border:      isDark ? '#2A2520' : '#E0D4C0',
    accent:      isDark ? '#C4A96A' : '#A0621A',
    accentBg:    isDark ? 'rgba(196,169,106,0.1)' : 'rgba(139,94,32,0.08)',
    textPrimary: isDark ? '#E8E0D0' : '#2C1A0E',
    textSub:     isDark ? '#6A5A44' : '#9A7A5A',
    iconBox:     isDark ? '#2A2520' : '#E8DCC8',
    switchOn:    isDark ? '#C4A96A' : '#2C1A0E',
    trial:       '#B8860B',
    success:     isDark ? '#66BB6A' : '#4CAF50',
  }), [isDark]);

  const trialDaysLeft = isTrial && expiresAt
    ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000))
    : 0;

  if (loading) return <View style={[styles.container, { backgroundColor: sc.bg }]}><Text style={{color: sc.textPrimary}}>{t('common.loading')}</Text></View>;

  return (
    <>
    <ScrollView
      style={{ flex: 1, backgroundColor: sc.bg }}
      contentContainerStyle={[styles.container, { backgroundColor: sc.bg }]}
    >
      {/* ===== 会员 ===== */}
      <TouchableOpacity
        testID="membership-row"
        onPress={() => navigation.navigate('Membership')}
        style={[styles.groupCard, { backgroundColor: sc.surface, borderColor: sc.border, marginBottom: 8 }]}
        activeOpacity={0.7}
      >
        <View style={[styles.settingsRow, { borderBottomWidth: 0 }]}>
          <Text style={[styles.rowLabel, { color: sc.textPrimary }]}>{t('membership.title')}</Text>
          {isTrial ? (
            <Text testID="membership-trial-badge" style={[styles.rowValue, { color: sc.trial, fontWeight: '500' }]}>
              {t('membership.trialActive', { days: trialDaysLeft })}
            </Text>
          ) : isActive ? (
            <Text style={[styles.rowValue, { color: sc.success, fontWeight: '500' }]}>
              {t('membership.subscribed')}
            </Text>
          ) : (
            <Text style={[styles.rowValue, { color: sc.accent, fontWeight: '500' }]}>
              {t('membership.upgrade')}
            </Text>
          )}
          <Ionicons name="chevron-forward" size={16} color={sc.textSub} style={{ marginLeft: 4 }} />
        </View>
      </TouchableOpacity>

      {/* ===== 外观 ===== */}
      <Text style={[styles.groupLabel, { color: sc.accent }]}>{t('settings.appearance')}</Text>
      <View style={[styles.groupCard, { backgroundColor: sc.surface, borderColor: sc.border }]}>

        {/* 语言 */}
        <View style={styles.settingsRow}>
          <Text style={[styles.rowLabel, { color: sc.textPrimary }]}>{t('settings.language')}</Text>
          <View style={styles.segControl}>
            {(['system', 'zh', 'en'] as const).map((lang, i, arr) => (
              <TouchableOpacity
                key={lang}
                onPress={() => updateSettings({ language: lang })}
                style={[
                  styles.segBtn,
                  { backgroundColor: settings.language === lang ? sc.accent : sc.iconBox },
                  i === 0 && styles.segBtnFirst,
                  i === arr.length - 1 && styles.segBtnLast,
                ]}
              >
                <Text style={[styles.segBtnText, { color: settings.language === lang ? (isDark ? '#0E0C0A' : '#FAF7F0') : sc.textSub }]}>
                  {lang === 'system' ? t('settings.languageSystem') : lang === 'zh' ? t('settings.languageChinese') : t('settings.languageEnglish')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={[styles.rowDivider, { backgroundColor: sc.border }]} />

        {/* 主题 */}
        <View style={styles.settingsRow}>
          <Text style={[styles.rowLabel, { color: sc.textPrimary }]}>{t('settings.themeMode')}</Text>
          <View style={styles.segControl}>
            {(['system', 'dark', 'light'] as const).map((theme, i, arr) => (
              <TouchableOpacity
                key={theme}
                onPress={() => updateSettings({ theme })}
                style={[
                  styles.segBtn,
                  { backgroundColor: settings.theme === theme ? sc.accent : sc.iconBox },
                  i === 0 && styles.segBtnFirst,
                  i === arr.length - 1 && styles.segBtnLast,
                ]}
              >
                <Text style={[styles.segBtnText, { color: settings.theme === theme ? (isDark ? '#0E0C0A' : '#FAF7F0') : sc.textSub }]}>
                  {theme === 'system' ? t('settings.themeSystem') : theme === 'dark' ? t('settings.themeDark') : t('settings.themeLight')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={[styles.rowDivider, { backgroundColor: sc.border }]} />

        {/* 字号 */}
        <View style={styles.settingsRow}>
          <Text style={[styles.rowLabel, { color: sc.textPrimary }]}>{t('settings.fontSize')}</Text>
          <View style={styles.stepper}>
            <TouchableOpacity onPress={() => updateSettings({ fontSize: Math.max(12, settings.fontSize - 2) })} style={[styles.stepBtn, { backgroundColor: sc.iconBox }]}>
              <Text style={[styles.stepBtnText, { color: sc.accent }]}>−</Text>
            </TouchableOpacity>
            <Text style={[styles.stepVal, { color: sc.textPrimary }]}>{settings.fontSize}</Text>
            <TouchableOpacity onPress={() => updateSettings({ fontSize: Math.min(30, settings.fontSize + 2) })} style={[styles.stepBtn, { backgroundColor: sc.iconBox }]}>
              <Text style={[styles.stepBtnText, { color: sc.accent }]}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.rowDivider, { backgroundColor: sc.border }]} />

        {/* 行距 */}
        <View style={styles.settingsRow}>
          <Text style={[styles.rowLabel, { color: sc.textPrimary }]}>{t('settings.lineSpacing')}</Text>
          <View style={styles.stepper}>
            <TouchableOpacity onPress={() => updateSettings({ lineSpacing: Math.max(1.2, Number((settings.lineSpacing - 0.1).toFixed(1))) })} style={[styles.stepBtn, { backgroundColor: sc.iconBox }]}>
              <Text style={[styles.stepBtnText, { color: sc.accent }]}>−</Text>
            </TouchableOpacity>
            <Text style={[styles.stepVal, { color: sc.textPrimary }]}>{settings.lineSpacing.toFixed(1)}</Text>
            <TouchableOpacity onPress={() => updateSettings({ lineSpacing: Math.min(2.2, Number((settings.lineSpacing + 0.1).toFixed(1))) })} style={[styles.stepBtn, { backgroundColor: sc.iconBox }]}>
              <Text style={[styles.stepBtnText, { color: sc.accent }]}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.rowDivider, { backgroundColor: sc.border }]} />

        {/* 字体 */}
        <TouchableOpacity onPress={() => setShowFonts((v) => !v)} style={styles.settingsRow} activeOpacity={0.7}>
          <Text style={[styles.rowLabel, { color: sc.textPrimary }]}>{t('settings.fontFamily')}</Text>
          <Text style={[styles.rowValue, { color: sc.textSub }]} numberOfLines={1}>{selectedFontLabel}</Text>
        </TouchableOpacity>

        {showFonts && (
          <View style={[styles.expandedList, { borderTopColor: sc.border }]}>
            {settingsFontOptions.map((option, idx, arr) => {
              const optionId = option.id as Exclude<typeof option.id, 'system'>;
              const selected = settings.fontPreset === optionId;
              return (
                <TouchableOpacity
                  key={optionId}
                  onPress={() => updateSettings({ fontPreset: optionId })}
                  style={[styles.listItem, { borderBottomColor: sc.border },
                    selected && { backgroundColor: sc.accentBg },
                    idx === arr.length - 1 && { borderBottomWidth: 0 },
                  ]}
                >
                  <Text style={[styles.listItemLabel, { color: selected ? sc.accent : sc.textPrimary, fontFamily: getFontFamilyForPreset(optionId) }]}>
                    {fontOptionMeta[optionId].label}
                  </Text>
                  {selected && <Text style={[styles.listItemCheck, { color: sc.accent }]}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {/* ===== 阅读 ===== */}
      <Text style={[styles.groupLabel, { color: sc.accent }]}>{t('settings.readingMode')}</Text>
      <View style={[styles.groupCard, { backgroundColor: sc.surface, borderColor: sc.border }]}>

        {/* 翻页模式 */}
        <View style={styles.settingsRow}>
          <Text style={[styles.rowLabel, { color: sc.textPrimary }]}>{t('settings.flipMode')}</Text>
          <View style={styles.segControl}>
            {(['scroll', 'horizontal'] as const).map((mode, i, arr) => (
              <TouchableOpacity
                key={mode}
                onPress={() => updateSettings({ flipMode: mode, flipInterval: mode === 'scroll' ? 30 : 15 })}
                style={[
                  styles.segBtn,
                  { backgroundColor: settings.flipMode === mode ? sc.accent : sc.iconBox },
                  i === 0 && styles.segBtnFirst,
                  i === arr.length - 1 && styles.segBtnLast,
                ]}
              >
                <Text style={[styles.segBtnText, { color: settings.flipMode === mode ? (isDark ? '#0E0C0A' : '#FAF7F0') : sc.textSub }]}>
                  {mode === 'scroll' ? t('settings.flipModeScroll') : t('settings.flipModeHorizontal')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={[styles.rowDivider, { backgroundColor: sc.border }]} />

        {/* 自动翻页速度 */}
        <View style={styles.settingsRow}>
          <Text style={[styles.rowLabel, { color: sc.textPrimary }]}>
            {settings.flipMode === 'scroll' ? t('settings.autoReadSpeed') : t('settings.autoFlipInterval')}
          </Text>
          <View style={styles.stepper}>
            <TouchableOpacity
              onPress={() => updateSettings({ flipInterval: settings.flipMode === 'scroll' ? Math.max(10, settings.flipInterval - 5) : Math.max(5, settings.flipInterval - 5) })}
              style={[styles.stepBtn, { backgroundColor: sc.iconBox }]}
            >
              <Text style={[styles.stepBtnText, { color: sc.accent }]}>−</Text>
            </TouchableOpacity>
            <Text style={[styles.stepVal, { color: sc.textPrimary }]}>{settings.flipInterval}</Text>
            <TouchableOpacity
              onPress={() => updateSettings({ flipInterval: settings.flipMode === 'scroll' ? Math.min(80, settings.flipInterval + 5) : settings.flipInterval + 5 })}
              style={[styles.stepBtn, { backgroundColor: sc.iconBox }]}
            >
              <Text style={[styles.stepBtnText, { color: sc.accent }]}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.rowDivider, { backgroundColor: sc.border }]} />

        {/* 常亮屏幕 */}
        <View style={styles.settingsRow}>
          <Text style={[styles.rowLabel, { color: sc.textPrimary }]}>{t('settings.keepScreenAwake')}</Text>
          <Switch
            value={settings.keepScreenAwake}
            onValueChange={(val) => updateSettings({ keepScreenAwake: val })}
            trackColor={{ false: sc.iconBox, true: sc.switchOn }}
            thumbColor={sc.bg}
          />
        </View>
      </View>

      {/* ===== 朗读 ===== */}
      <Text style={[styles.groupLabel, { color: sc.accent }]}>{t('settings.voiceReading')}</Text>
      <View style={[styles.groupCard, { backgroundColor: sc.surface, borderColor: sc.border }]}>

        {/* 语速 */}
        <View style={styles.settingsRow}>
          <Text style={[styles.rowLabel, { color: sc.textPrimary }]}>{t('settings.speechRate')}</Text>
          <View style={styles.stepper}>
            <TouchableOpacity onPress={() => updateSettings({ speechRate: Math.max(0.5, Number((settings.speechRate - 0.1).toFixed(1))) })} style={[styles.stepBtn, { backgroundColor: sc.iconBox }]}>
              <Text style={[styles.stepBtnText, { color: sc.accent }]}>−</Text>
            </TouchableOpacity>
            <Text style={[styles.stepVal, { color: sc.textPrimary }]}>{settings.speechRate.toFixed(1)}x</Text>
            <TouchableOpacity onPress={() => updateSettings({ speechRate: Math.min(2.0, Number((settings.speechRate + 0.1).toFixed(1))) })} style={[styles.stepBtn, { backgroundColor: sc.iconBox }]}>
              <Text style={[styles.stepBtnText, { color: sc.accent }]}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.rowDivider, { backgroundColor: sc.border }]} />

        {/* 音色 */}
        <TouchableOpacity onPress={() => setShowVoiceModal(true)} style={styles.settingsRow} activeOpacity={0.7}>
          <Text style={[styles.rowLabel, { color: sc.textPrimary }]}>{t('settings.voice')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.rowValue, { color: sc.textSub }]} numberOfLines={1}>
              {voicesLoading ? t('common.loading') : selectedVoiceLabel}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={sc.textSub} />
          </View>
        </TouchableOpacity>

        <View style={[styles.rowDivider, { backgroundColor: sc.border }]} />

        <TouchableOpacity
          onPress={clearVoiceCache}
          disabled={xfyunCacheSize === 0}
          style={styles.settingsRow}
          activeOpacity={0.7}
        >
          <Text style={[styles.rowLabel, { color: xfyunCacheSize === 0 ? sc.textSub : sc.textPrimary }]}>
            {t('settings.clearVoiceCache')}
          </Text>
          <Text style={[styles.rowValue, { color: sc.textSub }]}>
            {xfyunCacheSize > 0 ? formatBytes(xfyunCacheSize) : t('settings.xfyunCacheEmpty')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ===== 关于 ===== */}
      <Text style={[styles.groupLabel, { color: sc.accent }]}>{t('settings.about')}</Text>
      <View style={[styles.groupCard, { backgroundColor: sc.surface, borderColor: sc.border }]}>
        <View style={styles.settingsRow}>
          <Text style={[styles.rowLabel, { color: sc.textPrimary }]}>{t('settings.appVersion')}</Text>
          <Text style={[styles.rowValue, { color: sc.textSub }]}>{Constants.expoConfig?.version ?? '—'}</Text>
        </View>
        <View style={[styles.rowDivider, { backgroundColor: sc.border }]} />
        <View style={styles.settingsRow}>
          <Text style={[styles.rowLabel, { color: sc.textPrimary }]}>{t('settings.otaChannel')}</Text>
          <Text style={[styles.rowValue, { color: sc.textSub }]}>{Updates.channel ?? '—'}</Text>
        </View>
        <View style={[styles.rowDivider, { backgroundColor: sc.border }]} />
        <View style={styles.settingsRow}>
          <Text style={[styles.rowLabel, { color: sc.textPrimary }]}>{t('settings.otaVersion')}</Text>
          <Text style={[styles.rowValue, { color: sc.textSub }]} numberOfLines={1}>
            {Updates.updateId ? Updates.updateId.slice(0, 8) : t('settings.otaBuiltin')}
          </Text>
        </View>
      </View>
    </ScrollView>
    <VoicePickerModal
      visible={showVoiceModal}
      onClose={() => setShowVoiceModal(false)}
      voices={voices}
      selectedVoice={selectedVoice ?? 'default'}
      previewingVoiceId={previewingVoiceId}
      onVoiceTap={(id, lang) => {
        updateSettings({ voiceType: id });
        setShowVoiceModal(false);
        previewVoice(id, lang);
      }}
      defaultLang={voiceDefaultLang}
      t={t}
      colors={{ bg: sc.bg, surface: sc.surface, border: sc.border, accent: sc.accent, accentBg: sc.accentBg, textPrimary: sc.textPrimary, textSub: sc.textSub }}
      onNotInstalledTap={openVoiceSettings}
    />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 40,
  },
  groupLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 20,
    marginLeft: 4,
  },
  groupCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
    overflow: 'hidden',
  },
  settingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 14,
  },
  rowValue: {
    fontSize: 13,
    maxWidth: 140,
    textAlign: 'right',
  },
  segControl: {
    flexDirection: 'row',
    borderRadius: 8,
    overflow: 'hidden',
  },
  segBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segBtnFirst: {
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
  },
  segBtnLast: {
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
  },
  segBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 20,
  },
  stepVal: {
    fontSize: 14,
    fontWeight: '600',
    minWidth: 36,
    textAlign: 'center',
  },
  expandedList: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listItemLabel: {
    fontSize: 14,
    flex: 1,
  },
  listItemCheck: {
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 8,
  },
});
