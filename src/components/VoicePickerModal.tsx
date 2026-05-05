import React, { useMemo } from 'react';
import {
  View, Text, Pressable, ScrollView, Modal, StyleSheet,
  ActivityIndicator, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VoiceEntry } from '../utils/voiceUtils';
import { TranslationKey } from '../i18n/translations';
import { VoiceAvatar } from './VoiceAvatar';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const QUALITY_META: Record<string, { avatarColor: string; badgeColor: string; badgeBg: string }> = {
  Cloud:    { avatarColor: '#C4965A', badgeColor: '#92600A', badgeBg: 'rgba(196,150,90,0.15)' },
  Premium:  { avatarColor: '#8B72B8', badgeColor: '#5B3D8A', badgeBg: 'rgba(139,114,184,0.15)' },
  Enhanced: { avatarColor: '#5A9478', badgeColor: '#2D6A50', badgeBg: 'rgba(90,148,120,0.15)' },
  Default:  { avatarColor: '#8A8070', badgeColor: '#5A5048', badgeBg: 'rgba(138,128,112,0.15)' },
};

export interface PickerColors {
  bg: string;
  surface: string;
  border: string;
  accent: string;
  accentBg: string;
  textPrimary: string;
  textSub: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  voices: VoiceEntry[];
  selectedVoice: string;
  previewingVoiceId: string | null;
  onVoiceTap: (id: string, language: string) => void;
  defaultLang: string;
  t: (key: TranslationKey) => string;
  colors: PickerColors;
  onNotInstalledTap: () => void;
}

type GroupItem = { type: 'header'; label: string } | { type: 'voice'; voice: VoiceEntry };

function buildGroups(voices: VoiceEntry[], t: (k: TranslationKey) => string): GroupItem[] {
  const qualityOrder = { Cloud: 0, Premium: 1, Enhanced: 2, Default: 3 } as const;
  const sort = (a: VoiceEntry, b: VoiceEntry) => {
    const d = (qualityOrder[a.quality] ?? 4) - (qualityOrder[b.quality] ?? 4);
    return d !== 0 ? d : a.name.localeCompare(b.name);
  };
  const zh: VoiceEntry[] = [], yue: VoiceEntry[] = [], en: VoiceEntry[] = [];
  for (const v of voices) {
    const l = (v.language || '').toLowerCase();
    if (l.includes('yue') || l.includes('cantonese')) yue.push(v);
    else if (l.startsWith('zh')) zh.push(v);
    else if (l.startsWith('en')) en.push(v);
  }
  zh.sort(sort); yue.sort(sort); en.sort(sort);
  const items: GroupItem[] = [];
  const add = (label: string, arr: VoiceEntry[]) => {
    if (!arr.length) return;
    items.push({ type: 'header', label });
    arr.forEach(v => items.push({ type: 'voice', voice: v }));
  };
  add(t('voice.chinese'), zh);
  add(t('voice.cantonese'), yue);
  add(t('voice.english'), en);
  return items;
}

function qualityLabel(quality: string, t: (k: TranslationKey) => string): string {
  if (quality === 'Cloud') return t('voice.cloud');
  if (quality === 'Premium') return t('voice.qualityPremium');
  if (quality === 'Enhanced') return t('voice.qualityEnhanced');
  return t('voice.qualityDefault');
}


function VoiceCard({ voice, selected, previewing, onTap, colors, t }: {
  voice: VoiceEntry;
  selected: boolean;
  previewing: boolean;
  onTap: () => void;
  colors: PickerColors;
  t: (k: TranslationKey) => string;
}) {
  const meta = QUALITY_META[voice.quality] ?? QUALITY_META.Default;
  const notInstalled = voice.installed === false;

  return (
    <Pressable
      onPress={onTap}
      style={[
        styles.card,
        {
          backgroundColor: selected ? colors.accentBg : colors.surface,
          borderColor: notInstalled ? '#D4720A' : selected ? colors.accent : colors.border,
          borderStyle: notInstalled ? 'dashed' : 'solid',
        },
      ]}
    >
      <View style={styles.cardHeader}>
        {voice.gender === 'male' || voice.gender === 'female' ? (
          <VoiceAvatar gender={voice.gender} seed={voice.identifier} size={38} />
        ) : (
          <View style={[styles.neutralAvatar, { backgroundColor: selected ? colors.accent : meta.avatarColor }]}>
            <Ionicons name="person" size={18} color="#fff" />
          </View>
        )}
        <View style={styles.cardTitleBlock}>
          <Text style={[styles.cardName, { color: selected ? colors.accent : colors.textPrimary }]} numberOfLines={1}>
            {voice.name}
          </Text>
        </View>
        <View style={styles.cardStatusIcon}>
          {previewing
            ? <ActivityIndicator size="small" color={selected ? colors.accent : meta.avatarColor} />
            : selected
              ? <Ionicons name="checkmark-circle" size={17} color={colors.accent} />
              : null}
        </View>
      </View>

      {voice.description ? (
        <Text style={[styles.cardDesc, { color: colors.textSub }]} numberOfLines={2}>
          {voice.description}
        </Text>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap', marginTop: 2 }}>
        <View style={[styles.qualityBadge, { backgroundColor: selected ? colors.accentBg : meta.badgeBg }]}>
          <Text style={[styles.qualityText, { color: selected ? colors.accent : meta.badgeColor }]}>
            {qualityLabel(voice.quality, t)}
          </Text>
        </View>
        {notInstalled && (
          <View style={styles.downloadBadge}>
            <Ionicons name="cloud-download" size={10} color="#fff" />
            <Text style={styles.downloadBadgeText}>下载</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

export function VoicePickerModal({
  visible, onClose, voices, selectedVoice, previewingVoiceId,
  onVoiceTap, defaultLang, t, colors, onNotInstalledTap,
}: Props) {
  const groups = useMemo(() => buildGroups(voices, t), [voices, t]);
  const isDefaultSelected = !selectedVoice || selectedVoice === 'default';

  const rows: React.ReactNode[] = [];
  let i = 0;
  while (i < groups.length) {
    const item = groups[i];
    if (item.type === 'header') {
      rows.push(
        <View key={`h-${item.label}`} style={styles.sectionHeader}>
          <View style={[styles.sectionLine, { backgroundColor: colors.border }]} />
          <Text style={[styles.sectionLabel, { color: colors.textSub }]}>{item.label}</Text>
          <View style={[styles.sectionLine, { backgroundColor: colors.border }]} />
        </View>
      );
      i++;
    } else {
      const a = item.voice;
      const bItem = groups[i + 1];
      const b = bItem?.type === 'voice' ? bItem.voice : null;
      rows.push(
        <View key={`row-${a.identifier}`} style={styles.cardRow}>
          <VoiceCard
            voice={a}
            selected={selectedVoice === a.identifier}
            previewing={previewingVoiceId === a.identifier}
            onTap={() => a.installed !== false ? onVoiceTap(a.identifier, a.language) : onNotInstalledTap()}
            colors={colors}
            t={t}
          />
          {b ? (
            <VoiceCard
              voice={b}
              selected={selectedVoice === b.identifier}
              previewing={previewingVoiceId === b.identifier}
              onTap={() => b.installed !== false ? onVoiceTap(b.identifier, b.language) : onNotInstalledTap()}
              colors={colors}
              t={t}
            />
          ) : <View style={{ flex: 1 }} />}
        </View>
      );
      i += b ? 2 : 1;
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.bg }]}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>{t('settings.voice')}</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={22} color={colors.textSub} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* 默认选项 */}
          <Pressable
            onPress={() => onVoiceTap('default', defaultLang)}
            style={[
              styles.defaultCard,
              {
                backgroundColor: isDefaultSelected ? colors.accentBg : colors.surface,
                borderColor: isDefaultSelected ? colors.accent : colors.border,
              },
            ]}
          >
            <View style={[styles.defaultIcon, { backgroundColor: isDefaultSelected ? colors.accent : colors.border }]}>
              <Ionicons name="volume-medium-outline" size={16} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.defaultName, { color: isDefaultSelected ? colors.accent : colors.textPrimary }]}>
                {t('common.default')}
              </Text>
              <Text style={[styles.defaultDesc, { color: colors.textSub }]}>
                {t('settings.voiceHintIos').length > 0 ? '使用系统默认音色' : 'System default voice'}
              </Text>
            </View>
            {previewingVoiceId === 'default'
              ? <ActivityIndicator size="small" color={colors.accent} />
              : isDefaultSelected
                ? <Ionicons name="checkmark-circle" size={19} color={colors.accent} />
                : null}
          </Pressable>

          {rows}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    maxHeight: SCREEN_HEIGHT * 0.78,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 2,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 36,
    gap: 12,
  },
  defaultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  defaultIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  defaultName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  defaultDesc: {
    fontSize: 11,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
    marginBottom: 2,
  },
  sectionLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  cardRow: {
    flexDirection: 'row',
    gap: 10,
  },
  card: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  neutralAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  cardTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  cardName: {
    fontSize: 14,
    fontWeight: '700',
  },
  cardStatusIcon: {
    width: 20,
    alignItems: 'center',
    flexShrink: 0,
  },
  cardDesc: {
    fontSize: 11,
    lineHeight: 16,
  },
  qualityBadge: {
    alignSelf: 'flex-start',
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  qualityText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  downloadBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    alignSelf: 'flex-start',
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: '#D4720A',
  },
  downloadBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.2,
  },
});
