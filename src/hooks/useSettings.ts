import { useState, useEffect } from 'react';
import StorageService from '../services/StorageService';
import { STORAGE_KEYS } from '../utils/constants';
import { UserSettings } from '../types';

const DEFAULT_SETTINGS: UserSettings = {
  id: 'default',
  fontSize: 18,
  theme: 'light',
  flipMode: 'scroll',
  autoFlip: false,
  flipInterval: 30,
  speechRate: 1.0,
  voiceType: 'default',
};

export default function useSettings() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const data = await StorageService.getData(STORAGE_KEYS.USER_SETTINGS);
    if (data) {
      setSettings(data);
    }
    setLoading(false);
  };

  const updateSettings = async (newSettings: Partial<UserSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    await StorageService.storeData(STORAGE_KEYS.USER_SETTINGS, updated);
  };

  return {
    settings,
    loading,
    updateSettings,
  };
}
