import { mergeWithInstalledVoices, prependXfyunVoices } from '../src/utils/voiceUtils';

describe('xfyun voices', () => {
  it('mergeWithInstalledVoices puts xfyun voices first in the list', () => {
    const result = mergeWithInstalledVoices([]);
    expect(result[0].identifier).toBe('xfyun:xiaoyan');
    expect(result[1].identifier).toBe('xfyun:xiaoyu');
  });

  it('xfyun voices have installed=true and quality=Premium', () => {
    const result = mergeWithInstalledVoices([]);
    const xfyun = result.filter(v => v.identifier.startsWith('xfyun:'));
    expect(xfyun).toHaveLength(2);
    xfyun.forEach(v => {
      expect(v.installed).toBe(true);
      expect(v.quality).toBe('Premium');
      expect(v.language).toBe('zh-CN');
    });
  });

  it('prependXfyunVoices prepends xfyun voices before any list', () => {
    const local = [
      { identifier: 'local1', name: 'Local', language: 'zh-CN', quality: 'Default' as const, installed: true },
    ];
    const result = prependXfyunVoices(local);
    expect(result[0].identifier).toBe('xfyun:xiaoyan');
    expect(result[1].identifier).toBe('xfyun:xiaoyu');
    expect(result[2].identifier).toBe('local1');
  });

  it('prependXfyunVoices does not duplicate xfyun voices if already present', () => {
    const alreadyHas = [
      { identifier: 'xfyun:xiaoyan', name: '晓燕', language: 'zh-CN', quality: 'Premium' as const, installed: true },
    ];
    const result = prependXfyunVoices(alreadyHas);
    const xiaoyan = result.filter(v => v.identifier === 'xfyun:xiaoyan');
    expect(xiaoyan).toHaveLength(1);
  });
});
