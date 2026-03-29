import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  const [fontFallbackReady, setFontFallbackReady] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    LXGWWenKai: require('./assets/fonts/LXGWWenKai-Regular.ttf'),
    NotoSansSC: require('./assets/fonts/NotoSansCJKsc-Regular.otf'),
    NotoSerifSC: require('./assets/fonts/NotoSerifCJKsc-Regular.otf'),
    MaShanZheng: require('./assets/fonts/MaShanZheng-Regular.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      return;
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
        <StatusBar style="auto" />
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
