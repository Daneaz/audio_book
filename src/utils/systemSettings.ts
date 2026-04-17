import { Alert, Linking, Platform } from 'react-native';

export function promptThenOpenSystemSettings(message: string, cancelText: string, okText: string) {
  Alert.alert(message, undefined, [
    { text: cancelText, style: 'cancel' },
    {
      text: okText,
      onPress: () => {
        void (async () => {
          if (Platform.OS === 'ios') {
            const url = 'App-Prefs:';
            try {
              const ok = await Linking.canOpenURL(url);
              if (ok) {
                try {
                  await Linking.openURL(url);
                  return;
                } catch {}
              }
            } catch {}
          }

          try {
            await Linking.openSettings();
          } catch {}
        })();
      },
    },
  ]);
}

