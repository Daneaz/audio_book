import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import BookService from '../services/BookService';
import { Book } from '../types';
import { MaterialIcons } from '@expo/vector-icons'; 

export default function BookshelfScreen({ navigation }: any) {
  const [books, setBooks] = useState<Book[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadBooks = async () => {
    const data = await BookService.getBooks();
    setBooks(data);
  };

  useFocusEffect(
    useCallback(() => {
      loadBooks();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadBooks();
    setRefreshing(false);
  };

  const handleDelete = async (bookId: string) => {
      await BookService.removeBook(bookId);
      loadBooks();
  };

  const renderItem = ({ item }: { item: Book }) => (
    <TouchableOpacity 
        style={styles.bookCard} 
        onPress={() => navigation.navigate('Reader', { bookId: item.id })}
    >
      <View style={styles.bookInfo}>
          <Text style={styles.bookTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.bookMeta}>{item.totalChapters} Chapters</Text>
          <Text style={styles.bookDate}>Added: {new Date(item.createdAt).toLocaleDateString()}</Text>
      </View>
      <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteButton}>
          <MaterialIcons name="delete" size={24} color="gray" />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {books.length === 0 ? (
        <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No books yet.</Text>
            <Text style={styles.emptySubText}>Upload a TXT file to start reading.</Text>
            <TouchableOpacity style={styles.uploadButton} onPress={() => navigation.navigate('Upload')}>
                <Text style={styles.uploadButtonText}>Upload Book</Text>
            </TouchableOpacity>
        </View>
      ) : (
        <FlatList
            data={books}
            renderItem={renderItem}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
        />
      )}
      
      {books.length > 0 && (
          <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('Upload')}>
              <MaterialIcons name="add" size={30} color="white" />
          </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  listContent: {
    padding: 16,
  },
  bookCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
  },
  bookInfo: {
      flex: 1,
  },
  bookTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  bookMeta: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  bookDate: {
      fontSize: 12,
      color: '#999',
  },
  deleteButton: {
      padding: 8,
  },
  emptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
  },
  emptyText: {
      fontSize: 20,
      fontWeight: 'bold',
      color: '#333',
      marginBottom: 8,
  },
  emptySubText: {
      fontSize: 16,
      color: '#666',
      marginBottom: 20,
  },
  uploadButton: {
      backgroundColor: '#1E88E5',
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 24,
  },
  uploadButtonText: {
      color: 'white',
      fontSize: 16,
      fontWeight: 'bold',
  },
  fab: {
      position: 'absolute',
      right: 20,
      bottom: 20,
      backgroundColor: '#1E88E5',
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 4,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 3,
  }
});
