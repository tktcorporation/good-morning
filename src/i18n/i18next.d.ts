import 'i18next';
import type alarmJa from './locales/ja/alarm.json';
import type commonJa from './locales/ja/common.json';
import type dashboardJa from './locales/ja/dashboard.json';
import type onboardingJa from './locales/ja/onboarding.json';
import type statsJa from './locales/ja/stats.json';
import type wakeupJa from './locales/ja/wakeup.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof commonJa;
      alarm: typeof alarmJa;
      wakeup: typeof wakeupJa;
      stats: typeof statsJa;
      onboarding: typeof onboardingJa;
      dashboard: typeof dashboardJa;
    };
  }
}
