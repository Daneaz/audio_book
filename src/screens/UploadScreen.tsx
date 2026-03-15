import React, { useState } from 'react';
import { View, Text, StyleSheet, Button, ActivityIndicator, Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import BookService from '../services/BookService';
import ChapterService from '../services/ChapterService';
import StorageService from '../services/StorageService';
import { STORAGE_KEYS } from '../utils/constants';

export default function UploadScreen({ navigation }: any) {
  const [loading, setLoading] = useState(false);

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'text/plain',
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        return;
      }

      const file = result.assets[0];
      if (!file) return;

      setLoading(true);

      // Add book
      const newBook = await BookService.addBook(file.uri, file.name);

      // Parse chapters in background or now? 
      // For simplicity, do it now.
      const chapters = await ChapterService.parseChapters(newBook.id, newBook.filePath);
      
      // Update book with total chapters
      newBook.totalChapters = chapters.length;
      await BookService.updateBook(newBook);
      
      // Store chapters
      await StorageService.storeData(`${STORAGE_KEYS.CHAPTERS_PREFIX}${newBook.id}`, chapters);

      setLoading(false);
      Alert.alert('Success', 'Book imported successfully', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);

    } catch (error) {
      console.error(error);
      setLoading(false);
      Alert.alert('Error', 'Failed to import book');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Import Books</Text>
      <View style={styles.buttonContainer}>
        <Button title="Select TXT File from Device" onPress={handlePickDocument} disabled={loading} />
      </View>
      
      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0000ff" />
          <Text>Importing and parsing chapters...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    marginBottom: 40,
  },
  buttonContainer: {
    width: '100%',
    marginBottom: 20,
  },
  loadingContainer: {
    marginTop: 20,
    alignItems: 'center',
  }
});
