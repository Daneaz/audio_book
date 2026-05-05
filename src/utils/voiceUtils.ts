export interface VoiceEntry {
  identifier: string;
  name: string;
  language: string;
  quality: 'Default' | 'Enhanced' | 'Premium' | 'Cloud';
  installed: boolean;
  description?: string;
  gender?: 'male' | 'female' | 'neutral';
}

const XFYUN_VOICES: VoiceEntry[] = [
  { identifier: 'x4_yezi',        name: '小露',   language: 'zh-CN', quality: 'Cloud', installed: true, description: '温柔细腻，适合睡前轻读', gender: 'female' },
  { identifier: 'x4_xiaoyan',     name: '小燕',   language: 'zh-CN', quality: 'Cloud', installed: true, description: '清脆明快，播音主持风格', gender: 'female' },
  { identifier: 'xiaoyu',         name: '晓宇',   language: 'zh-CN', quality: 'Cloud', installed: true, description: '沉稳大气，男声朗读',   gender: 'male'   },
  { identifier: 'aisjiuxu',       name: '许久',   language: 'zh-CN', quality: 'Cloud', installed: true, description: '磁性低沉，情感丰富',   gender: 'male'   },
  { identifier: 'aisxping',       name: '小萍',   language: 'zh-CN', quality: 'Cloud', installed: true, description: '亲切自然，贴近生活',   gender: 'female' },
  { identifier: 'aisjinger',      name: '小婧',   language: 'zh-CN', quality: 'Cloud', installed: true, description: '甜美活泼，充满活力',   gender: 'female' },
  { identifier: 'aisbabyxu',      name: '许小宝', language: 'zh-CN', quality: 'Cloud', installed: true, description: '清脆可爱，童声质感',   gender: 'neutral'},
  { identifier: 'x4_xiaoxi',      name: '水哥',   language: 'zh-CN', quality: 'Cloud', installed: true, description: '稳重专业，男播音',     gender: 'male'   },
  { identifier: 'x4_lingbosong',  name: '聆伯松', language: 'zh-CN', quality: 'Cloud', installed: true, description: '深沉浑厚，磁性男声',   gender: 'male'   },
];


const XFYUN_VOICE_IDS = new Set(XFYUN_VOICES.map(v => v.identifier));

export function isXfyunVoice(identifier: string): boolean {
  return XFYUN_VOICE_IDS.has(identifier);
}

const KNOWN_IOS_ZH_VOICES: Omit<VoiceEntry, 'installed'>[] = [
  { identifier: 'com.apple.voice.premium.zh-TW.Meijia', name: '美佳', language: 'zh-TW', quality: 'Premium', description: '台湾腔调，柔和优雅', gender: 'female' },
  { identifier: 'com.apple.voice.premium.zh-CN.Lili',   name: '莉莉', language: 'zh-CN', quality: 'Premium', description: '普通话标准，清晰流畅', gender: 'female' },
  { identifier: 'com.apple.voice.premium.zh-CN.Lilian', name: '李恋', language: 'zh-CN', quality: 'Premium', description: '温婉细腻，娓娓道来', gender: 'female' },
  { identifier: 'com.apple.voice.premium.zh-CN.Yue',    name: '小月', language: 'zh-CN', quality: 'Premium', description: '清新自然，宛如月光', gender: 'female' },
  { identifier: 'com.apple.voice.premium.zh-CN.Han',    name: '小韩', language: 'zh-CN', quality: 'Premium', description: '男声沉稳，端庄大气', gender: 'male'   },
  { identifier: 'com.apple.voice.premium.zh-CN.Yun',    name: '小云', language: 'zh-CN', quality: 'Premium', description: '优雅女声，气质出众', gender: 'female' },
  { identifier: 'com.apple.voice.premium.en-US.Zoe',    name: 'Zoe',  language: 'en-US', quality: 'Premium', description: 'Warm and expressive', gender: 'female' },
  { identifier: 'com.apple.voice.premium.en-US.Ava',    name: 'Ava',  language: 'en-US', quality: 'Premium', description: 'Clear and natural',  gender: 'female' },
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
