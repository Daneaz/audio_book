import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
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
  const [appReady, setAppReady] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    LXGWWenKai: require('./assets/fonts/LXGWWenKai-Regular.ttf'),
    NotoSansSC: require('./assets/fonts/NotoSansCJKsc-Regular.otf'),
    NotoSerifSC: require('./assets/fonts/NotoSerifCJKsc-Regular.otf'),
    MaShanZheng: require('./assets/fonts/MaShanZheng-Regular.ttf'),
  });

  useEffect(() => {
    SplashScreen.hideAsync();
    if (!__DEV__) {
      checkForUpdate();
    }
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      const elapsed = Date.now() - splashStartTime;
      const delay = Math.max(0, MIN_SPLASH_MS - elapsed);
      const timer = setTimeout(() => setAppReady(true), delay);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => setAppReady(true), 2500);
    return () => clearTimeout(timer);
  }, [fontsLoaded, fontError]);

  if (!appReady) {
    return (
      <View style={styles.splash}>
        <Image source={require('./assets/splash.png')} style={styles.splashImage} resizeMode="cover" />
        <StatusBar style="dark" hidden />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <AppNavigator />
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: '#203B33',
  },
  splashImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
});
