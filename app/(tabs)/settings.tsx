import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useLanguage } from '@/contexts/LanguageContext';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Language } from '@/constants/Translations';

export default function SettingsScreen() {
  const { t, language, setLanguage } = useLanguage();
  const colorScheme = useColorScheme();
  const tintColor = Colors[colorScheme ?? 'light'].tint;

  const changeLanguage = async (newLanguage: Language) => {
    await setLanguage(newLanguage);
  };

  return (
    <>
      <Stack.Screen options={{ title: t('settingsTitle'), headerShown: true }} />
      <ThemedView style={styles.container}>
        <ThemedText style={styles.title}>{t('settingsTitle')}</ThemedText>
        <ThemedText style={styles.description}>
          {t('settingsDescription')}
        </ThemedText>

        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>{t('languageSettings')}</ThemedText>
          
          <View style={styles.languageOptions}>
            <TouchableOpacity
              style={[
                styles.languageButton,
                language === 'zh' && { backgroundColor: tintColor }
              ]}
              onPress={() => changeLanguage('zh')}
            >
              <ThemedText 
                style={[
                  styles.languageButtonText,
                  language === 'zh' && { color: 'white' }
                ]}
              >
                {t('languageZh')}
              </ThemedText>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.languageButton,
                language === 'en' && { backgroundColor: tintColor }
              ]}
              onPress={() => changeLanguage('en')}
            >
              <ThemedText 
                style={[
                  styles.languageButtonText,
                  language === 'en' && { color: 'white' }
                ]}
              >
                {t('languageEn')}
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </ThemedView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 30,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  languageOptions: {
    flexDirection: 'row',
    gap: 10,
  },
  languageButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  languageButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
}); 