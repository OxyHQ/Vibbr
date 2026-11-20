import AsyncStorage from '@react-native-async-storage/async-storage';
import { createBloomThemeStorage } from '@oxy.so/bloom/theme';

/**
 * Where Bloom persists the active theme (`{ mode?, colorPreset? }` as JSON). Web gets
 * synchronous `localStorage` (no palette flash before first paint); native gets `AsyncStorage`.
 */
export const { persistKey: BLOOM_THEME_PERSIST_KEY, storage: BLOOM_THEME_STORAGE } =
  createBloomThemeStorage('vibbr.bloom.theme', AsyncStorage);
