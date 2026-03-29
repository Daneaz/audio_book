import { useState, useEffect } from 'react';
import { DeviceEventEmitter } from 'react-native';
import StorageService from '../services/StorageService';
import { STORAGE_KEYS } from '../utils/constants';
import { UserSettings } from '../types';

const VALID_FONT_PRESETS: UserSettings['fontPreset'][] = ['hei', 'kai', 'song', 'mashan'];

const DEFAULT_SETTINGS: UserSettings = {
  id: 'default',
  fontSize: 18,
  lineSpacing: 1.5,
  language: 'system',
  speechTimerDefaultMinutes: null,
  fontPreset: 'hei',
  theme: 'light',
  flipMode: 'scroll',
  autoFlip: false,
  flipInterval: 30,
  speechRate: 1.0,
  voiceType: 'default',
};

const SETTINGS_CHANGED_EVENT = 'SETTINGS_CHANGED';

export default function useSettings() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
    
    // 监听全局设置改变事件
    const subscription = DeviceEventEmitter.addListener(SETTINGS_CHANGED_EVENT, (newSettings: UserSettings) => {
      setSettings(newSettings);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const loadSettings = async () => {
    const data = await StorageService.getData(STORAGE_KEYS.USER_SETTINGS);
    if (data) {
      const normalizedFontPreset = VALID_FONT_PRESETS.includes(data.fontPreset) ? data.fontPreset : DEFAULT_SETTINGS.fontPreset;
      setSettings({ ...DEFAULT_SETTINGS, ...data, fontPreset: normalizedFontPreset });
    }
    setLoading(false);
  };

  const updateSettings = async (newSettings: Partial<UserSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    await StorageService.storeData(STORAGE_KEYS.USER_SETTINGS, updated);
    // 触发全局事件通知其他页面更新
    DeviceEventEmitter.emit(SETTINGS_CHANGED_EVENT, updated);
  };

  return {
    settings,
    loading,
    updateSettings,
  };
}
