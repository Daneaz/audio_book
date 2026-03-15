import AsyncStorage from '@react-native-async-storage/async-storage';

class StorageService {
  async getData(key: string) {
    try {
      const jsonValue = await AsyncStorage.getItem(key);
      return jsonValue != null ? JSON.parse(jsonValue) : null;
    } catch (e) {
      console.error('Error reading value', e);
      return null;
    }
  }

  async storeData(key: string, value: any) {
    try {
      const jsonValue = JSON.stringify(value);
      await AsyncStorage.setItem(key, jsonValue);
    } catch (e) {
      console.error('Error saving value', e);
    }
  }

  async removeData(key: string) {
    try {
      await AsyncStorage.removeItem(key);
    } catch (e) {
      console.error('Error removing value', e);
    }
  }
}

export default new StorageService();
