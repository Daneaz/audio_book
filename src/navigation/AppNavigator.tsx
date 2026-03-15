import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import BookshelfScreen from '../screens/BookshelfScreen';
import ReaderScreen from '../screens/ReaderScreen';
import UploadScreen from '../screens/UploadScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ChaptersScreen from '../screens/ChaptersScreen';

const Stack = createStackNavigator();

export default function AppNavigator() {
  return (
    <Stack.Navigator initialRouteName="Bookshelf">
      <Stack.Screen name="Bookshelf" component={BookshelfScreen} options={{ title: '我的书架' }} />
      <Stack.Screen name="Reader" component={ReaderScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Upload" component={UploadScreen} options={{ title: '上传书籍' }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: '设置' }} />
      <Stack.Screen name="Chapters" component={ChaptersScreen} options={{ title: '目录' }} />
    </Stack.Navigator>
  );
}
