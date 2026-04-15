export interface VoiceEntry {
  identifier: string;
  name: string;
  language: string;
  quality: 'Default' | 'Enhanced' | 'Premium';
  installed: boolean;
}

const KNOWN_IOS_ZH_VOICES: Omit<VoiceEntry, 'installed'>[] = [
  { identifier: 'com.apple.ttsbundle.Tingting-compact', name: 'Tingting', language: 'zh-CN', quality: 'Default' },
  { identifier: 'com.apple.ttsbundle.Tingting-premium', name: 'Tingting', language: 'zh-CN', quality: 'Premium' },
  { identifier: 'com.apple.ttsbundle.Meijia-compact',   name: 'Meijia',   language: 'zh-TW', quality: 'Default' },
  { identifier: 'com.apple.ttsbundle.Meijia-premium',   name: 'Meijia',   language: 'zh-TW', quality: 'Premium' },
];

export function mergeWithInstalledVoices(
  installed: Array<{ identifier: string; name?: string; language?: string; quality?: string }>
): VoiceEntry[] {
  const installedMap = new Map(installed.map(v => [v.identifier, v]));
  const knownIds = new Set(KNOWN_IOS_ZH_VOICES.map(v => v.identifier));

  const result: VoiceEntry[] = KNOWN_IOS_ZH_VOICES.map(v => ({
    ...v,
    installed: installedMap.has(v.identifier),
  }));

  for (const v of installed) {
    if (knownIds.has(v.identifier)) continue;
    if ((v.identifier || '').toLowerCase().includes('eloquence')) continue;
    result.push({
      identifier: v.identifier,
      name: v.name || v.identifier,
      language: v.language || 'zh-CN',
      quality: v.quality === 'Premium' ? 'Premium' : v.quality === 'Enhanced' ? 'Enhanced' : 'Default',
      installed: true,
    });
  }

  return result;
}
