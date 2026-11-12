import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'adultSearch1';
let cached: boolean | undefined;

/**
 * Off unless the reader turns it on in Settings. Even then it only widens typed searches: nothing 18+ is ever
 * browsed, recommended or listed on its own.
 */
export async function getAdultSearch(): Promise<boolean> {
  if (cached === undefined) {
    cached = (await AsyncStorage.getItem(KEY).catch(() => null)) === '1';
  }
  return cached;
}

export async function setAdultSearch(on: boolean): Promise<void> {
  cached = on;
  await AsyncStorage.setItem(KEY, on ? '1' : '0').catch(() => {});
}
