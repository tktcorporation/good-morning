import { initializeAlarmKit } from '../services';
import { initHealthKit } from '../services/health';

/**
 * アプリで必要な各種OS権限の定義。
 *
 * 配列に要素を追加するだけで、オンボーディングと設定画面の両方に
 * 自動で反映される。required: true の権限はオンボーディングで
 * 許可するまで先に進めない。
 */

export type PermissionStatus = 'pending' | 'granted' | 'denied';

export interface PermissionItem {
  /** 一意な識別子 */
  readonly id: string;
  /** UI表示用の絵文字アイコン */
  readonly icon: string;
  /**
   * i18n キーの末尾セグメント。リテラル union にすることで
   * `permission.items.${i18nKey}.name`（onboarding）/
   * `settings.permissionItems.${i18nKey}.name`（common）が型付きキーとして解決でき、
   * t() 呼び出しの型アサーションを不要にする。権限を追加するときは両 namespace の
   * リソースにも対応キーを追加する（無ければコンパイルエラーで検知される）。
   */
  readonly i18nKey: 'alarmKit' | 'healthKit';
  /** true = オンボーディングで必須、false = オプション */
  readonly required: boolean;
  /** 権限をリクエストする関数。成功時 true を返す */
  readonly request: () => Promise<boolean>;
}

export const APP_PERMISSIONS: readonly PermissionItem[] = [
  {
    id: 'alarmKit',
    icon: '🔔',
    i18nKey: 'alarmKit',
    required: true,
    request: async () => {
      const status = await initializeAlarmKit();
      return status === 'authorized';
    },
  },
  {
    id: 'healthKit',
    icon: '❤️',
    i18nKey: 'healthKit',
    required: false,
    request: async () => {
      return await initHealthKit();
    },
  },
];
