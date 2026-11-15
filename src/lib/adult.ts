import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';

const KEY = 'adultConfirmed1';
let confirmed: boolean | null = null;

/**
 * Asks once whether the reader is 18 or older before showing adult content, and remembers a yes on this phone.
 * Resolves true when they may continue.
 */
export async function confirmAdult(): Promise<boolean> {
  if (confirmed === null) confirmed = (await AsyncStorage.getItem(KEY).catch(() => null)) === '1';
  if (confirmed) return true;
  const yes = await new Promise<boolean>((resolve) =>
    Alert.alert(
      '18+ content',
      'This section contains adult material and is only for people aged 18 or older. Do you want to continue?',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'I am 18+', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
  if (yes) {
    confirmed = true;
    AsyncStorage.setItem(KEY, '1').catch(() => {});
  }
  return yes;
}
