import { UserSettings } from '../types';

export const BUNDLED_FONT_FAMILIES = {
  hei: 'NotoSansSC',
  kai: 'LXGWWenKai',
  song: 'NotoSerifSC',
  mashan: 'MaShanZheng',
} as const;

export const FONT_PRESET_OPTIONS: Array<{ id: UserSettings['fontPreset'] }> = [
  { id: 'system' },
  { id: 'hei' },
  { id: 'kai' },
  { id: 'song' },
  { id: 'mashan' },
];

export function getFontFamilyForPreset(preset: UserSettings['fontPreset']) {
  switch (preset) {
    case 'hei':
      return BUNDLED_FONT_FAMILIES.hei;
    case 'kai':
      return BUNDLED_FONT_FAMILIES.kai;
    case 'song':
      return BUNDLED_FONT_FAMILIES.song;
    case 'mashan':
      return BUNDLED_FONT_FAMILIES.mashan;
    case 'system':
    default:
      return undefined;
  }
}
