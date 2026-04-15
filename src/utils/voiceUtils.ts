export interface VoiceEntry {
    identifier: string;
    name: string;
    language: string;
    quality: 'Default' | 'Enhanced' | 'Premium';
    installed: boolean;
}


const KNOWN_IOS_ZH_VOICES: Omit<VoiceEntry, 'installed'>[] = [
    {identifier: 'com.apple.voice.premium.zh-TW.Meijia', name: '美佳', language: 'zh-TW', quality: 'Premium'},
    {identifier: 'com.apple.voice.premium.zh-CN.Lili', name: '莉莉', language: 'zh-CN', quality: 'Premium'},
    {identifier: 'com.apple.voice.premium.zh-CN.Lilian', name: '李恋', language: 'zh-CN', quality: 'Premium'},
    {identifier: 'com.apple.voice.premium.zh-CN.Yue', name: '小月', language: 'zh-CN', quality: 'Premium'},
    {identifier: 'com.apple.voice.premium.zh-CN.Han', name: '小韩', language: 'zh-CN', quality: 'Premium'},
    {identifier: 'com.apple.voice.premium.zh-CN.Yun', name: '小云', language: 'zh-CN', quality: 'Premium'},

    {identifier: 'com.apple.voice.premium.en-US.Zoe', name: 'Zoe', language: 'en-US', quality: 'Premium'},
    {identifier: 'com.apple.voice.premium.en-US.Ava', name: 'Ava', language: 'en-US', quality: 'Premium'},
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
        if ((v.identifier || '').toLowerCase().includes('synthesis')) continue;
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
