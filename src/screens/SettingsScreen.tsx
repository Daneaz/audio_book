import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity, ScrollView, ActivityIndicator, useColorScheme } from 'react-native';
import useSettings from '../hooks/useSettings';
import * as Speech from 'expo-speech';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import { FONT_PRESET_OPTIONS, getFontFamilyForPreset } from '../utils/fontUtils';
import useI18n from '../i18n';

const EXCLUDED_VOICE_NAMES = new Set([
  'Zarvox',
  'Wobble',
  'Whisper',
  'Trinoids',
  'Organ',
  'Jester',
  'Good News',
  'Cellos',
  'Bubbles',
  'Boing',
  'Bells',
  'Bahh',
  'Bad News',
  'Albert',
]);

export default function SettingsScreen() {
  const { settings, updateSettings, loading } = useSettings();
  const { t, language } = useI18n();
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voices, setVoices] = useState<Array<{ identifier: string; name?: string; language?: string }>>([]);
  const [showVoices, setShowVoices] = useState(false);
  const [showFonts, setShowFonts] = useState(false);
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadVoices = async () => {
      setVoicesLoading(true);
      try {
        const available = await Speech.getAvailableVoicesAsync();
        if (cancelled) return;

        const normalized = (available || [])
          .map((v: any) => ({
            identifier: String(v.identifier),
            name: typeof v.name === 'string' ? v.name : undefined,
            language: typeof v.language === 'string' ? v.language : undefined,
          }))
          .filter((v) => {
            if (!v.identifier) return false;
            const language = (v.language || '').toLowerCase();
            if (!(language.startsWith('zh') || language.startsWith('en'))) return false;
            if (v.name && EXCLUDED_VOICE_NAMES.has(v.name)) return false;
            return true;
          });

        setVoices(normalized);
      } finally {
        if (!cancelled) setVoicesLoading(false);
      }
    };

    loadVoices();
    return () => {
      cancelled = true;
      Speech.stop();
    };
  }, []);

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
    const zh: typeof voices = [];
    const other: typeof voices = [];
    for (const v of voices) {
      if ((v.language || '').toLowerCase().startsWith('zh')) zh.push(v);
      else other.push(v);
    }
    const sortByLabel = (a: (typeof voices)[number], b: (typeof voices)[number]) => {
      const la = `${a.name || ''} ${a.language || ''} ${a.identifier}`.toLowerCase();
      const lb = `${b.name || ''} ${b.language || ''} ${b.identifier}`.toLowerCase();
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
    return `${v.name || v.identifier}${v.language ? ` (${v.language})` : ''}`;
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
  const bgColor = isDark ? '#121212' : '#f5f5f5';
  const sectionBgColor = isDark ? '#1E1E1E' : '#fff';
  const textColor = isDark ? '#e0e0e0' : '#333';
  const subTextColor = isDark ? '#aaa' : '#666';
  const borderColor = isDark ? '#333' : '#ddd';

  if (loading) return <View style={[styles.container, { backgroundColor: bgColor }]}><Text style={{color: textColor}}>{t('common.loading')}</Text></View>;

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: bgColor }]}>
      <View style={[styles.section, { backgroundColor: sectionBgColor }]}>
        <Text style={styles.sectionTitle}>{t('settings.appearance')}</Text>

        <View style={styles.row}>
          <Text style={[styles.label, { color: textColor }]}>{t('settings.language')}</Text>
          <View style={styles.languageControls}>
            <TouchableOpacity
              onPress={() => updateSettings({ language: 'system' })}
              style={[styles.languageButton, { borderColor }, settings.language === 'system' && styles.modeButtonActive]}
            >
              <Text style={[styles.languageButtonText, { color: textColor }, settings.language === 'system' && styles.modeButtonTextActive]}>
                {t('settings.languageSystem')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => updateSettings({ language: 'zh' })}
              style={[styles.languageButton, { borderColor }, settings.language === 'zh' && styles.modeButtonActive]}
            >
              <Text style={[styles.languageButtonText, { color: textColor }, settings.language === 'zh' && styles.modeButtonTextActive]}>
                {t('settings.languageChinese')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => updateSettings({ language: 'en' })}
              style={[styles.languageButton, { borderColor }, settings.language === 'en' && styles.modeButtonActive]}
            >
              <Text style={[styles.languageButtonText, { color: textColor }, settings.language === 'en' && styles.modeButtonTextActive]}>
                {t('settings.languageEnglish')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        
        <View style={styles.row}>
          <Text style={[styles.label, { color: textColor }]}>{t('settings.themeMode')}</Text>
          <View style={styles.languageControls}>
            <TouchableOpacity
              onPress={() => updateSettings({ theme: 'system' })}
              style={[styles.languageButton, { borderColor }, settings.theme === 'system' && styles.modeButtonActive]}
            >
              <Text style={[styles.languageButtonText, { color: textColor }, settings.theme === 'system' && styles.modeButtonTextActive]}>
                {t('settings.themeSystem')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => updateSettings({ theme: 'dark' })}
              style={[styles.languageButton, { borderColor }, settings.theme === 'dark' && styles.modeButtonActive]}
            >
              <Text style={[styles.languageButtonText, { color: textColor }, settings.theme === 'dark' && styles.modeButtonTextActive]}>
                {t('settings.themeDark')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => updateSettings({ theme: 'light' })}
              style={[styles.languageButton, { borderColor }, settings.theme === 'light' && styles.modeButtonActive]}
            >
              <Text style={[styles.languageButtonText, { color: textColor }, settings.theme === 'light' && styles.modeButtonTextActive]}>
                {t('settings.themeLight')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.row}>
          <Text style={[styles.label, { color: textColor }]}>{t('settings.fontSize')}: {settings.fontSize}</Text>
          <View style={styles.controls}>
            <TouchableOpacity onPress={() => updateSettings({ fontSize: Math.max(12, settings.fontSize - 2) })} style={[styles.button, { backgroundColor: isDark ? '#333' : '#eee' }]}>
              <Text style={[styles.buttonText, { color: textColor }]}>-</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => updateSettings({ fontSize: Math.min(30, settings.fontSize + 2) })} style={[styles.button, { backgroundColor: isDark ? '#333' : '#eee' }]}>
              <Text style={[styles.buttonText, { color: textColor }]}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={[styles.previewCard, { backgroundColor: isDark ? '#171B23' : '#F8FAFC', borderColor }]}>
          <Text
            style={[
              styles.sizePreview,
              {
                color: textColor,
                fontSize: settings.fontSize,
                lineHeight: settings.fontSize * settings.lineSpacing,
                fontFamily: selectedFontFamily,
              },
            ]}
          >
            {t('reader.fontPreview')}
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={[styles.label, { color: textColor }]}>{t('settings.lineSpacing')}: {settings.lineSpacing.toFixed(1)}</Text>
          <View style={styles.controls}>
            <TouchableOpacity
              onPress={() => updateSettings({ lineSpacing: Math.max(1.2, Number((settings.lineSpacing - 0.1).toFixed(1))) })}
              style={[styles.button, { backgroundColor: isDark ? '#333' : '#eee' }]}
            >
              <Text style={[styles.buttonText, { color: textColor }]}>-</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => updateSettings({ lineSpacing: Math.min(2.2, Number((settings.lineSpacing + 0.1).toFixed(1))) })}
              style={[styles.button, { backgroundColor: isDark ? '#333' : '#eee' }]}
            >
              <Text style={[styles.buttonText, { color: textColor }]}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={[styles.previewCard, { backgroundColor: isDark ? '#171B23' : '#F8FAFC', borderColor }]}>
          <Text
            style={[
              styles.spacingPreview,
              {
                color: textColor,
                fontFamily: selectedFontFamily,
                lineHeight: settings.fontSize * settings.lineSpacing,
              },
            ]}
          >
            {t('reader.lineSpacingPreview')}
          </Text>
        </View>

        <TouchableOpacity onPress={() => setShowFonts((value) => !value)} style={styles.row} activeOpacity={0.7}>
          <Text style={[styles.label, { color: textColor }]}>{t('settings.fontFamily')}</Text>
          <Text style={[styles.valueText, { color: subTextColor }]} numberOfLines={1}>
            {selectedFontLabel}
          </Text>
        </TouchableOpacity>

        {showFonts && (
          <View style={[styles.voiceList, { borderTopColor: borderColor }]}>
            {settingsFontOptions.map((option) => {
              const optionId = option.id as Exclude<typeof option.id, 'system'>;
              const selected = settings.fontPreset === optionId;
              return (
                <TouchableOpacity
                  key={optionId}
                  onPress={() => updateSettings({ fontPreset: optionId })}
                  style={[styles.voiceItem, selected && [styles.voiceItemSelected, { backgroundColor: isDark ? '#334' : '#eef6ff' }]]}
                >
                  <Text style={[styles.voiceName, { color: textColor }]}>{fontOptionMeta[optionId].label}</Text>
                  <Text style={[styles.fontDescription, { color: subTextColor }]}>{fontOptionMeta[optionId].description}</Text>
                  <Text
                    style={[
                      styles.fontPreview,
                      {
                        color: textColor,
                        fontFamily: getFontFamilyForPreset(optionId),
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {t('reader.fontPreview')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      <View style={[styles.section, { backgroundColor: sectionBgColor }]}>
        <Text style={styles.sectionTitle}>{t('settings.readingMode')}</Text>
        <View style={styles.row}>
          <Text style={[styles.label, { color: textColor }]}>{t('settings.keepScreenAwake')}</Text>
          <Switch
            value={settings.keepScreenAwake}
            onValueChange={(val) => updateSettings({ keepScreenAwake: val })}
          />
        </View>
        <View style={styles.row}>
            <Text style={[styles.label, { color: textColor }]}>{t('settings.flipMode')}</Text>
            <View style={styles.optionControls}>
              <TouchableOpacity 
                onPress={() => updateSettings({ flipMode: 'scroll', flipInterval: 30 })} 
                style={[styles.optionButton, { borderColor }, settings.flipMode === 'scroll' && styles.modeButtonActive]}
              >
                <Text style={[styles.optionButtonText, { color: textColor }, settings.flipMode === 'scroll' && styles.modeButtonTextActive]}>{t('settings.flipModeScroll')}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => updateSettings({ flipMode: 'horizontal', flipInterval: 15 })} 
                style={[styles.optionButton, { borderColor }, settings.flipMode === 'horizontal' && styles.modeButtonActive]}
              >
                <Text style={[styles.optionButtonText, { color: textColor }, settings.flipMode === 'horizontal' && styles.modeButtonTextActive]}>{t('settings.flipModeHorizontal')}</Text>
              </TouchableOpacity>
            </View>
        </View>
        <View style={styles.row}>
            <Text style={[styles.label, { color: textColor }]}>
              {settings.flipMode === 'scroll' ? t('settings.autoReadSpeed') : t('settings.autoFlipInterval')}
            </Text>
            <View style={styles.controls}>
              <TouchableOpacity
                onPress={() =>
                  updateSettings({
                    flipInterval: settings.flipMode === 'scroll'
                      ? Math.max(10, settings.flipInterval - 5)
                      : Math.max(5, settings.flipInterval - 5)
                  })
                }
                style={[styles.button, { backgroundColor: isDark ? '#333' : '#eee' }]}
              >
                <Text style={[styles.buttonText, { color: textColor }]}>-</Text>
              </TouchableOpacity>
              <Text style={{ marginHorizontal: 10, color: textColor }}>
                {settings.flipMode === 'scroll' ? `${settings.flipInterval}` : settings.flipInterval}
              </Text>
              <TouchableOpacity
                onPress={() =>
                  updateSettings({
                    flipInterval: settings.flipMode === 'scroll'
                      ? Math.min(80, settings.flipInterval + 5)
                      : settings.flipInterval + 5
                  })
                }
                style={[styles.button, { backgroundColor: isDark ? '#333' : '#eee' }]}
              >
                <Text style={[styles.buttonText, { color: textColor }]}>+</Text>
              </TouchableOpacity>
            </View>
        </View>
      </View>

      <View style={[styles.section, { backgroundColor: sectionBgColor }]}>
        <Text style={styles.sectionTitle}>{t('settings.voiceReading')}</Text>

        <View style={styles.row}>
          <Text style={[styles.label, { color: textColor }]}>{t('settings.speechRate')}: {settings.speechRate.toFixed(1)}x</Text>
          <View style={styles.controls}>
            <TouchableOpacity
              onPress={() => updateSettings({ speechRate: Math.max(0.5, Number((settings.speechRate - 0.1).toFixed(1))) })}
              style={[styles.button, { backgroundColor: isDark ? '#333' : '#eee' }]}
            >
              <Text style={[styles.buttonText, { color: textColor }]}>-</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => updateSettings({ speechRate: Math.min(2.0, Number((settings.speechRate + 0.1).toFixed(1))) })}
              style={[styles.button, { backgroundColor: isDark ? '#333' : '#eee' }]}
            >
              <Text style={[styles.buttonText, { color: textColor }]}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => setShowVoices((v) => !v)}
          style={styles.row}
          activeOpacity={0.7}
        >
          <Text style={[styles.label, { color: textColor }]}>{t('settings.voice')}</Text>
          <Text style={[styles.valueText, { color: subTextColor }]} numberOfLines={1}>
            {voicesLoading ? t('common.loading') : selectedVoiceLabel}
          </Text>
        </TouchableOpacity>
        <Text style={[styles.helperText, { color: subTextColor }]}>{t('settings.voicePreviewHint')}</Text>

        {showVoices && (
          <View style={[styles.voiceList, { borderTopColor: borderColor }]}>
            {voicesLoading ? (
              <View style={styles.voiceLoading}>
                <ActivityIndicator color={textColor} />
              </View>
            ) : (
              <>
                <TouchableOpacity
                  onPress={() => previewVoice('default', language === 'zh' ? 'zh-CN' : 'en-US').then(() => updateSettings({ voiceType: 'default' }))}
                  style={[styles.voiceItem, selectedVoice === 'default' && [styles.voiceItemSelected, { backgroundColor: isDark ? '#334' : '#eef6ff' }]]}
                >
                  <View style={styles.voiceRow}>
                    <Text style={[styles.voiceName, { color: textColor, flex: 1 }]}>{t('common.default')}</Text>
                    <TouchableOpacity
                      onPress={() => previewVoice('default', language === 'zh' ? 'zh-CN' : 'en-US')}
                      style={[styles.previewButton, { borderColor }]}
                    >
                      <Text style={[styles.previewButtonText, { color: textColor }]}>
                        {previewingVoiceId === 'default' ? t('common.loading') : t('common.preview')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
                {sortedVoices.slice(0, 60).map((v) => {
                  const label = `${v.name || v.identifier}${v.language ? ` (${v.language})` : ''}`;
                  const selected = selectedVoice === v.identifier;
                  return (
                    <TouchableOpacity
                      key={v.identifier}
                      onPress={() => previewVoice(v.identifier, v.language).then(() => updateSettings({ voiceType: v.identifier }))}
                      style={[styles.voiceItem, selected && [styles.voiceItemSelected, { backgroundColor: isDark ? '#334' : '#eef6ff' }]]}
                    >
                      <View style={styles.voiceRow}>
                        <Text style={[styles.voiceName, { color: textColor, flex: 1 }]} numberOfLines={1}>
                          {label}
                        </Text>
                        <TouchableOpacity
                          onPress={() => previewVoice(v.identifier, v.language)}
                          style={[styles.previewButton, { borderColor }]}
                        >
                          <Text style={[styles.previewButtonText, { color: textColor }]}>
                            {previewingVoiceId === v.identifier ? t('common.loading') : t('common.preview')}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
          </View>
        )}
      </View>

      <View style={[styles.section, { backgroundColor: sectionBgColor }]}>
        <Text style={styles.sectionTitle}>{t('settings.about')}</Text>
        <View style={styles.row}>
          <Text style={[styles.label, { color: textColor }]}>{t('settings.appVersion')}</Text>
          <Text style={[styles.valueText, { color: subTextColor }]}>{Constants.expoConfig?.version ?? '—'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={[styles.label, { color: textColor }]}>{t('settings.otaChannel')}</Text>
          <Text style={[styles.valueText, { color: subTextColor }]}>{Updates.channel ?? '—'}</Text>
        </View>
        <View style={[styles.row, { marginBottom: 0 }]}>
          <Text style={[styles.label, { color: textColor }]}>{t('settings.otaVersion')}</Text>
          <Text style={[styles.valueText, { color: subTextColor }]} numberOfLines={1}>
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
  },
  section: {
    marginBottom: 30,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#1E88E5',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
  },
  valueText: {
    fontSize: 14,
    color: '#666',
    flex: 1,
    textAlign: 'right',
    marginLeft: 12,
  },
  previewCard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: -4,
    marginBottom: 16,
  },
  sizePreview: {
    fontWeight: '500',
  },
  spacingPreview: {
    fontSize: 16,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  button: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#eee',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  modeControls: {
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  optionControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'nowrap',
    marginLeft: 12,
  },
  optionButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    marginLeft: 8,
  },
  optionButtonText: {
    fontSize: 13,
    color: '#333',
  },
  languageControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'nowrap',
    marginLeft: 12,
  },
  languageButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    marginLeft: 8,
  },
  languageButtonText: {
    fontSize: 13,
    color: '#333',
  },
  modeButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    marginBottom: 6,
  },
  modeButtonActive: {
    backgroundColor: '#1E88E5',
    borderColor: '#1E88E5',
  },
  modeButtonText: {
    fontSize: 14,
    color: '#333',
  },
  modeButtonTextActive: {
    color: '#fff',
  },
  voiceList: {
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ddd',
  },
  voiceLoading: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helperText: {
    fontSize: 12,
    marginTop: -8,
    marginBottom: 12,
  },
  voiceItem: {
    paddingVertical: 10,
  },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  voiceItemSelected: {
    backgroundColor: '#eef6ff',
  },
  voiceName: {
    fontSize: 14,
  },
  previewBadge: {
    fontSize: 12,
  },
  previewButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderRadius: 999,
  },
  previewButtonText: {
    fontSize: 12,
    fontWeight: '500',
  },
  fontDescription: {
    fontSize: 12,
    marginTop: 4,
  },
  fontPreview: {
    fontSize: 16,
    marginTop: 8,
  },
});
