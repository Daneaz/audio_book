jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Alert: { alert: jest.fn() },
  Linking: {
    canOpenURL: jest.fn(),
    openURL: jest.fn(),
    openSettings: jest.fn(),
  },
}));

import { Alert, Linking } from 'react-native';
import { promptThenOpenSystemSettings } from '../src/utils/systemSettings';

describe('promptThenOpenSystemSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows prompt and opens iOS Settings app when user confirms', async () => {
    (Linking.canOpenURL as jest.Mock).mockResolvedValue(true);
    (Linking.openURL as jest.Mock).mockResolvedValue(undefined);

    promptThenOpenSystemSettings('hint', 'cancel', 'ok');

    expect(Alert.alert).toHaveBeenCalledWith(
      'hint',
      undefined,
      expect.arrayContaining([
        expect.objectContaining({ text: 'cancel' }),
        expect.objectContaining({ text: 'ok' }),
      ])
    );

    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
    const okButton = buttons[1];
    okButton.onPress();

    await Promise.resolve();
    await Promise.resolve();

    expect(Linking.canOpenURL).toHaveBeenCalledWith('App-Prefs:');
    expect(Linking.openURL).toHaveBeenCalledWith('App-Prefs:');
    expect(Linking.openSettings).not.toHaveBeenCalled();
  });
});
