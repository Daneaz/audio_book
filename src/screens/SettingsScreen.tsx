import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity, ScrollView, ActivityIndicator, useColorScheme, Platform, Linking, Alert, AppState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import useSettings from '../hooks/useSettings';
import * as Speech from 'expo-speech';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import { FONT_PRESET_OPTIONS, getFontFamilyForPreset } from '../utils/fontUtils';
import { VoiceEntry, mergeWithInstalledVoices } from '../utils/voiceUtils';
import useI18n from '../i18n';

const ALLOWED_ENGLISH_VOICE_NAMES = new Set([
  'Daniel',
  'Karen',
  'Moira',
  'Rishi',
  'Samantha',
  'Tessa',
]);

export default function SettingsScreen() {
  const { settings, updateSettings, loading } = useSettings();
  const { t, language } = useI18n();
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voices, setVoices] = useState<VoiceEntry[]>([]);
  const [showVoices, setShowVoices] = useState(false);
  const [showFonts, setShowFonts] = useState(false);
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);
  const cancelledRef = useRef(false);

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
          return lang.startsWith('zh') || lang.startsWith('yue');
        });
        setVoices(mergeWithInstalledVoices(zhInstalled));
      } else {
        const normalized = raw
          .filter(v => {
            if (!v.identifier) return false;
            const lang = (v.language || '').toLowerCase();
            if (lang.startsWith('zh') || lang.startsWith('yue')) return true;
            if (lang.startsWith('en')) return v.name ? ALLOWED_ENGLISH_VOICE_NAMES.has(v.name) : false;
            return false;
          })
          .map(v => ({
            identifier: v.identifier,
            name: v.name || v.identifier,
            language: v.language || '',
            quality: (v.quality === 'Enhanced' ? 'Enhanced' : 'Default') as 'Default' | 'Enhanced',
            installed: true,
          }));
        setVoices(normalized);
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
    };
  }, [loadVoices]);

  const openVoiceSettings = useCallback(async () => {
    const url = 'App-Prefs:root=ACCESSIBILITY&path=SPEECH/VOICES';
    const ok = await Linking.canOpenURL(url);
    if (ok) {
      Linking.openURL(url);
    } else {
      Alert.alert(t('settings.voiceHintIos'));
    }
  }, [t]);

  const previewVoice = async (voiceId: string, voiceLanguage?: string) => {
    const normalizedLanguage = (voiceLanguage || '').toLowerCase();
    const previewText = normalizedLanguage.startsWith('zh') ? t('settings.voicePreviewZh') : t('settings.voicePreviewEn');
    const speechLanguage = normalizedLanguage.startsWith('zh') ? 'zh-CN' : 'en-US';

    Speech.stop();
    setPreviewingVoiceId(voiceId);

    Speech.speak(previewText, {
      language: speechLanguage,
      rate: settings.speechRate,
      voice: voiceId === 'default' ? undefined : voiceId,
      useApplicationAudioSession: false,
      onDone: () => setPreviewingVoiceId((current) => (current === voiceId ? null : current)),
      onStopped: () => setPreviewingVoiceId((current) => (current === voiceId ? null : current)),
      onError: () => setPreviewingVoiceId((current) => (current === voiceId ? null : current)),
    });
  };

  const sortedVoices = useMemo(() => {
    const zh: VoiceEntry[] = [];
    const other: VoiceEntry[] = [];
    for (const v of voices) {
      if ((v.language || '').toLowerCase().startsWith('zh')) zh.push(v);
      else other.push(v);
    }
    const sortByLabel = (a: VoiceEntry, b: VoiceEntry) => {
      const la = `${a.quality === 'Default' ? '0' : '1'} ${a.name} ${a.language} ${a.identifier}`.toLowerCase();
      const lb = `${b.quality === 'Default' ? '0' : '1'} ${b.name} ${b.language} ${b.identifier}`.toLowerCase();
      return la.localeCompare(lb);
    };
    zh.sort(sortByLabel);
    other.sort(sortByLabel);
    return [...zh, ...other];
  }, [voices]);

  const selectedVoice = settings.voiceType;
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
    const qualityLabel = v.quality === 'Enhanced' ? ` · ${t('voice.qualityEnhanced')}` : '';
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
  }), [isDark]);

  if (loading) return <View style={[styles.container, { backgroundColor: sc.bg }]}><Text style={{color: sc.textPrimary}}>{t('common.loading')}</Text></View>;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: sc.bg }}
      contentContainerStyle={[styles.container, { backgroundColor: sc.bg }]}
    >
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
        <TouchableOpacity onPress={() => setShowVoices((v) => !v)} style={styles.settingsRow} activeOpacity={0.7}>
          <Text style={[styles.rowLabel, { color: sc.textPrimary }]}>{t('settings.voice')}</Text>
          <Text style={[styles.rowValue, { color: sc.textSub }]} numberOfLines={1}>
            {voicesLoading ? t('common.loading') : selectedVoiceLabel}
          </Text>
        </TouchableOpacity>

        {showVoices && (
          <View style={[styles.expandedList, { borderTopColor: sc.border }]}>
            {voicesLoading ? (
              <ActivityIndicator color={sc.accent} style={{ paddingVertical: 12 }} />
            ) : (
              <>
                {[{ identifier: 'default', name: t('common.default'), language: language === 'zh' ? 'zh-CN' : 'en-US', quality: 'Default' as const, installed: true }, ...sortedVoices.slice(0, 60)].map((v, idx, arr) => {
                  const isDefault = v.identifier === 'default';
                  const selected = selectedVoice === v.identifier || (isDefault && (!selectedVoice || selectedVoice === 'default'));
                  const notInstalled = !isDefault && !v.installed;
                  return (
                    <TouchableOpacity
                      key={v.identifier}
                      onPress={() => {
                        if (notInstalled) { openVoiceSettings(); return; }
                        previewVoice(v.identifier, v.language).then(() => updateSettings({ voiceType: v.identifier }));
                      }}
                      style={[styles.listItem, { borderBottomColor: sc.border },
                        selected && { backgroundColor: sc.accentBg },
                        notInstalled && { opacity: 0.5 },
                        idx === arr.length - 1 && { borderBottomWidth: 0 },
                      ]}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                        <Text style={[styles.listItemLabel, { color: selected ? sc.accent : sc.textPrimary }]} numberOfLines={1}>{v.name}</Text>
                        {!isDefault && v.quality === 'Enhanced' && (
                          <View style={{ backgroundColor: sc.accentBg, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                            <Text style={{ fontSize: 10, color: sc.accent }}>{t('voice.qualityEnhanced')}</Text>
                          </View>
                        )}
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        {previewingVoiceId === v.identifier && <ActivityIndicator size="small" color={sc.accent} />}
                        {notInstalled
                          ? <Ionicons name="cloud-download-outline" size={18} color={sc.textSub} />
                          : selected && <Text style={[styles.listItemCheck, { color: sc.accent }]}>✓</Text>
                        }
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
          </View>
        )}
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
