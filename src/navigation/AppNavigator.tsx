import React, { useEffect, useState } from 'react';
import { ActivityIndicator, TouchableOpacity, View, useColorScheme } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import BookshelfScreen from '../screens/BookshelfScreen';
import ReaderScreen from '../screens/ReaderScreen';
import UploadScreen from '../screens/UploadScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ChaptersScreen from '../screens/ChaptersScreen';
import useSettings from '../hooks/useSettings';
import BookService from '../services/BookService';
import { getTranslator } from '../i18n';

const Stack = createStackNavigator();

export default function AppNavigator() {
  const { settings } = useSettings();
  const { t } = getTranslator(settings);
  const colorScheme = useColorScheme();
  const isDark = settings.theme === 'system' ? colorScheme === 'dark' : settings.theme === 'dark';
  const [ready, setReady] = useState(false);
  const [initialState, setInitialState] = useState<object | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    const resolveInitialRoute = async () => {
      const books = await BookService.getBooks();
      if (cancelled) return;

      const mostRecentBook = books.length > 0
        ? [...books].sort(
            (a, b) => new Date(b.lastReadAt || b.createdAt).getTime() - new Date(a.lastReadAt || a.createdAt).getTime()
          )[0]
        : null;

      if (mostRecentBook) {
        setInitialState({
          routes: [
            { name: 'Bookshelf' },
            { name: 'Reader', params: { bookId: mostRecentBook.id } },
          ],
        });
      }

      setReady(true);
    };

    resolveInitialRoute();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? '#121212' : '#f5f5f5' }}>
        <ActivityIndicator size="large" color={isDark ? '#ffffff' : '#1E88E5'} />
      </View>
    );
  }

  // @ts-ignore
  return (
    <NavigationContainer theme={isDark ? DarkTheme : DefaultTheme} initialState={initialState}>
      <Stack.Navigator>
        <Stack.Screen
          name="Bookshelf"
          component={BookshelfScreen}
          options={({ navigation }) => ({
            title: t('nav.bookshelf'),
            headerRight: () => (
              <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={{ paddingHorizontal: 14 }}>
                <Ionicons name="settings-outline" size={22} color={isDark ? '#fff' : '#000'} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="Reader"
          component={ReaderScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen name="Upload" component={UploadScreen} options={{ title: t('nav.upload') }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: t('nav.settings') }} />
        <Stack.Screen name="Chapters" component={ChaptersScreen} options={{ title: t('nav.chapters') }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
