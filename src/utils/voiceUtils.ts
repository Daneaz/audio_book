export interface VoiceEntry {
  identifier: string;
  name: string;
  language: string;
  quality: 'Default' | 'Enhanced' | 'Premium' | 'Cloud';
  installed: boolean;
}

const XFYUN_VOICES: VoiceEntry[] = [
  { identifier: 'xfyun:xiaoyan', name: '晓燕', language: 'zh-CN', quality: 'Cloud', installed: true },
  { identifier: 'xfyun:xiaoyu', name: '晓宇', language: 'zh-CN', quality: 'Cloud', installed: true },
];

const KNOWN_IOS_ZH_VOICES: Omit<VoiceEntry, 'installed'>[] = [
  { identifier: 'com.apple.voice.premium.zh-TW.Meijia', name: '美佳', language: 'zh-TW', quality: 'Premium' },
  { identifier: 'com.apple.voice.premium.zh-CN.Lili', name: '莉莉', language: 'zh-CN', quality: 'Premium' },
  { identifier: 'com.apple.voice.premium.zh-CN.Lilian', name: '李恋', language: 'zh-CN', quality: 'Premium' },
  { identifier: 'com.apple.voice.premium.zh-CN.Yue', name: '小月', language: 'zh-CN', quality: 'Premium' },
  { identifier: 'com.apple.voice.premium.zh-CN.Han', name: '小韩', language: 'zh-CN', quality: 'Premium' },
  { identifier: 'com.apple.voice.premium.zh-CN.Yun', name: '小云', language: 'zh-CN', quality: 'Premium' },
  { identifier: 'com.apple.voice.premium.en-US.Zoe', name: 'Zoe', language: 'en-US', quality: 'Premium' },
  { identifier: 'com.apple.voice.premium.en-US.Ava', name: 'Ava', language: 'en-US', quality: 'Premium' },
];

export function prependXfyunVoices(voices: VoiceEntry[]): VoiceEntry[] {
  const existingIds = new Set(voices.map(v => v.identifier));
  const newXfyun = XFYUN_VOICES.filter(v => !existingIds.has(v.identifier));
  return [...newXfyun, ...voices];
}

export function mergeWithInstalledVoices(
  installed: Array<{ identifier: string; name?: string; language?: string; quality?: string }>
): VoiceEntry[] {
  const installedMap = new Map(installed.map(v => [v.identifier, v]));
  const knownIds = new Set(KNOWN_IOS_ZH_VOICES.map(v => v.identifier));

  const systemVoices: VoiceEntry[] = KNOWN_IOS_ZH_VOICES.map(v => ({
    ...v,
    installed: installedMap.has(v.identifier),
  }));

  for (const v of installed) {
    if (knownIds.has(v.identifier)) continue;
    if ((v.identifier || '').toLowerCase().includes('eloquence')) continue;
    if ((v.identifier || '').toLowerCase().includes('synthesis')) continue;
    systemVoices.push({
      identifier: v.identifier,
      name: v.name || v.identifier,
      language: v.language || 'zh-CN',
      quality: v.quality === 'Premium' ? 'Premium' : v.quality === 'Enhanced' ? 'Enhanced' : 'Default',
      installed: true,
    });
  }

  return prependXfyunVoices(systemVoices);
}
