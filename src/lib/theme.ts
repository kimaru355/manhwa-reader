import { useColorScheme } from 'react-native';

const light = {
  bg: '#FFFFFF',
  card: '#F4F4F6',
  text: '#222222',
  sub: '#8A8A93',
  border: '#E8E8EC',
  accent: '#A24BE0',
  danger: '#D64545',
};

const dark: typeof light = {
  bg: '#121214',
  card: '#1E1E22',
  text: '#F2F2F4',
  sub: '#8E8E98',
  border: '#2A2A30',
  accent: '#B76CF0',
  danger: '#F06A6A',
};

export type Theme = typeof light;

export const useTheme = (): Theme => (useColorScheme() === 'dark' ? dark : light);
