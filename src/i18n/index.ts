import * as Localization from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import alarmEn from './locales/en/alarm.json';
import commonEn from './locales/en/common.json';
import statsEn from './locales/en/stats.json';
import wakeupEn from './locales/en/wakeup.json';
import alarmJa from './locales/ja/alarm.json';
import commonJa from './locales/ja/common.json';
import statsJa from './locales/ja/stats.json';
import wakeupJa from './locales/ja/wakeup.json';

const SUPPORTED_LANGUAGES = ['ja', 'en'] as const;
const DEFAULT_LANGUAGE = 'ja';

function getDeviceLanguage(): string {
  const locales = Localization.getLocales();
  const deviceLang = locales[0]?.languageCode ?? DEFAULT_LANGUAGE;
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(deviceLang)
    ? deviceLang
    : DEFAULT_LANGUAGE;
}

i18n.use(initReactI18next).init({
  lng: getDeviceLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  defaultNS: 'common',
  resources: {
    ja: { common: commonJa, alarm: alarmJa, wakeup: wakeupJa, stats: statsJa },
    en: { common: commonEn, alarm: alarmEn, wakeup: wakeupEn, stats: statsEn },
  },
  interpolation: { escapeValue: false },
});

export default i18n;
