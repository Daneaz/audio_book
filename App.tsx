import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Updates from 'expo-updates';
import * as SplashScreen from 'expo-splash-screen';
import AppNavigator from './src/navigation/AppNavigator';

SplashScreen.preventAutoHideAsync();
const splashStartTime = Date.now();
const MIN_SPLASH_MS = 1000;

async function checkForUpdate() {
  try {
    const update = await Updates.checkForUpdateAsync();
    if (update.isAvailable) {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    }
  } catch (e) {
    console.error('[OTA] checkForUpdate error:', e);
  }
}

export default function App() {
  const [fontFallbackReady, setFontFallbackReady] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    LXGWWenKai: require('./assets/fonts/LXGWWenKai-Regular.ttf'),
    NotoSansSC: require('./assets/fonts/NotoSansCJKsc-Regular.otf'),
    NotoSerifSC: require('./assets/fonts/NotoSerifCJKsc-Regular.otf'),
    MaShanZheng: require('./assets/fonts/MaShanZheng-Regular.ttf'),
  });

  useEffect(() => {
    if (!__DEV__) {
      checkForUpdate();
    }
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      const elapsed = Date.now() - splashStartTime;
      const delay = Math.max(0, MIN_SPLASH_MS - elapsed);
      const timer = setTimeout(() => {
        SplashScreen.hideAsync();
      }, delay);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => {
      setFontFallbackReady(true);
    }, 2500);

    return () => clearTimeout(timer);
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError && !fontFallbackReady) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f5' }}>
          <ActivityIndicator size="large" color="#1E88E5" />
        </View>
        <StatusBar style="dark" />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <AppNavigator />
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
