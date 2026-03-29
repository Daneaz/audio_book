import { NativeModules, Platform } from 'react-native';
import { useMemo } from 'react';
import useSettings from '../hooks/useSettings';
import { AppLanguage, UserSettings } from '../types';
import { translations, TranslationKey } from './translations';

function getDeviceLocale() {
  const intlLocale = Intl?.DateTimeFormat?.().resolvedOptions?.().locale;
  if (intlLocale) {
    return intlLocale;
  }

  if (Platform.OS === 'ios') {
    const settings = NativeModules.SettingsManager?.settings;
    return settings?.AppleLocale || settings?.AppleLanguages?.[0] || 'en';
  }

  return NativeModules.I18nManager?.localeIdentifier || 'en';
}

export function resolveLanguage(preference: AppLanguage): 'zh' | 'en' {
  if (preference === 'zh' || preference === 'en') {
    return preference;
  }

  const locale = String(getDeviceLocale()).toLowerCase();
  return locale.startsWith('zh') ? 'zh' : 'en';
}

export function translate(
  language: 'zh' | 'en',
  key: TranslationKey,
  params?: Record<string, string | number>
) {
  let template = translations[language][key] ?? translations.zh[key] ?? key;

  if (!params) {
    return template;
  }

  Object.entries(params).forEach(([name, value]) => {
    template = template.replace(new RegExp(`\\{${name}\\}`, 'g'), String(value));
  });

  return template;
}

export function getTranslator(settings: Pick<UserSettings, 'language'>) {
  const language = resolveLanguage(settings.language);

  return {
    language,
    t: (key: TranslationKey, params?: Record<string, string | number>) => translate(language, key, params),
  };
}

export default function useI18n() {
  const { settings } = useSettings();

  return useMemo(() => getTranslator(settings), [settings]);
}
