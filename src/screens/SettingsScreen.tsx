import React from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity, ScrollView } from 'react-native';
import useSettings from '../hooks/useSettings';

export default function SettingsScreen() {
  const { settings, updateSettings, loading } = useSettings();

  if (loading) return <View style={styles.container}><Text>Loading...</Text></View>;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Appearance</Text>
        
        <View style={styles.row}>
          <Text style={styles.label}>Dark Mode</Text>
          <Switch
            value={settings.theme === 'dark'}
            onValueChange={(val) => updateSettings({ theme: val ? 'dark' : 'light' })}
          />
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Font Size: {settings.fontSize}</Text>
          <View style={styles.controls}>
            <TouchableOpacity onPress={() => updateSettings({ fontSize: Math.max(12, settings.fontSize - 2) })} style={styles.button}>
              <Text style={styles.buttonText}>-</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => updateSettings({ fontSize: Math.min(30, settings.fontSize + 2) })} style={styles.button}>
              <Text style={styles.buttonText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Reading</Text>
        <View style={styles.row}>
            <Text style={styles.label}>Auto Flip</Text>
            <Switch
                value={settings.autoFlip}
                onValueChange={(val) => updateSettings({ autoFlip: val })}
            />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
  },
  section: {
    marginBottom: 30,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#1E88E5',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  button: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#eee',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: 'bold',
  }
});
