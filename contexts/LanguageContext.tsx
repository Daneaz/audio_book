import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Language, TranslationKeys, translations } from '@/constants/Translations';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  t: (key: keyof TranslationKeys, params?: Record<string, string>) => string;
}

const defaultLanguage: Language = 'zh';

export const LanguageContext = createContext<LanguageContextType>({
  language: defaultLanguage,
  setLanguage: async () => {},
  t: (key) => key as string,
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(defaultLanguage);
  
  useEffect(() => {
    // 在组件挂载时从存储中加载保存的语言设置
    const loadLanguage = async () => {
      try {
        const savedLanguage = await AsyncStorage.getItem('userLanguage');
        if (savedLanguage && (savedLanguage === 'zh' || savedLanguage === 'en')) {
          setLanguageState(savedLanguage as Language);
        }
      } catch (error) {
        console.error('无法加载语言设置:', error);
      }
    };
    
    loadLanguage();
  }, []);
  
  const setLanguage = async (lang: Language) => {
    try {
      await AsyncStorage.setItem('userLanguage', lang);
      setLanguageState(lang);
    } catch (error) {
      console.error('无法保存语言设置:', error);
    }
  };
  
  // 翻译助手函数，支持参数替换
  const t = (key: keyof TranslationKeys, params?: Record<string, string>) => {
    let translation = translations[language][key] || key;
    
    // 如果有参数，替换字符串中的参数占位符
    if (params) {
      Object.entries(params).forEach(([paramKey, paramValue]) => {
        translation = translation.replace(`{${paramKey}}`, paramValue);
      });
    }
    
    return translation;
  };
  
  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext); 