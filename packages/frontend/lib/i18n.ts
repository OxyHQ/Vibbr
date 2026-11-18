import { createInstance, type i18n as I18n } from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../locales/en.json';
import es from '../locales/es.json';
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from './config';

export const appI18n: I18n = createInstance();

let initialized: Promise<unknown> | null = null;

/** Falls back to English for any language without a catalogue or any missing key. */
export function initI18n(language: string = DEFAULT_LANGUAGE): Promise<unknown> {
  initialized ??= appI18n.use(initReactI18next).init({
    resources: { 'en-US': { translation: en }, 'es-ES': { translation: es } },
    lng: pickSupported(language),
    fallbackLng: DEFAULT_LANGUAGE,
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  return initialized;
}

export function pickSupported(language: string): string {
  const exact = SUPPORTED_LANGUAGES.find((l) => l.toLowerCase() === language.toLowerCase());
  if (exact) return exact;
  const base = language.split('-')[0]?.toLowerCase();
  return (
    SUPPORTED_LANGUAGES.find((l) => l.toLowerCase().startsWith(`${base}-`)) ?? DEFAULT_LANGUAGE
  );
}

export function setLanguage(language: string): Promise<unknown> {
  return appI18n.changeLanguage(pickSupported(language));
}
