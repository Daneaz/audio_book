import { mergeWithInstalledVoices, prependXfyunVoices } from '../src/utils/voiceUtils';

describe('xfyun voices', () => {
  it('mergeWithInstalledVoices puts xfyun voices first in the list', () => {
    const result = mergeWithInstalledVoices([]);
    expect(result[0].identifier).toBe('x4_yezi');
    expect(result[1].identifier).toBe('x4_xiaoyan');
  });

  it('xfyun voices have installed=true and quality=Cloud', () => {
    const result = mergeWithInstalledVoices([]);
    const xfyun = result.filter(v => v.quality === 'Cloud');
    expect(xfyun.length).toBeGreaterThan(0);
    xfyun.forEach(v => {
      expect(v.installed).toBe(true);
      expect(v.quality).toBe('Cloud');
      expect(v.language).toBe('zh-CN');
    });
  });

  it('prependXfyunVoices prepends xfyun voices before any list', () => {
    const local = [
      { identifier: 'local1', name: 'Local', language: 'zh-CN', quality: 'Default' as const, installed: true },
    ];
    const result = prependXfyunVoices(local);
    expect(result[0].identifier).toBe('x4_yezi');
    expect(result[1].identifier).toBe('x4_xiaoyan');
    expect(result[result.length - 1].identifier).toBe('local1');
  });

  it('prependXfyunVoices does not duplicate xfyun voices if already present', () => {
    const alreadyHas = [
      { identifier: 'x4_xiaoyan', name: '小燕', language: 'zh-CN', quality: 'Cloud' as const, installed: true },
    ];
    const result = prependXfyunVoices(alreadyHas);
    const xiaoyan = result.filter(v => v.identifier === 'x4_xiaoyan');
    expect(xiaoyan).toHaveLength(1);
  });
});
