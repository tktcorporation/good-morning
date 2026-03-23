/**
 * UI状態カタログの自動生成に使用する型定義。
 *
 * Screen State Registry（screen-states.ts）で全画面の全状態を定義し、
 * scripts/generate-ui-docs.ts で markdown カタログを生成する。
 * 将来的に Storybook Stories やスクリーンショット自動撮影の入力にもなる。
 */

/** 画面の1つの状態を表す。 */
export interface ScreenState {
  /** 状態の表示名（例: "Loading", "Idle（TODOあり）"） */
  readonly name: string;

  /** この状態になる条件（例: "loaded === false"） */
  readonly condition: string;

  /**
   * スクリーンショットファイル名。
   * `docs/screenshots/{screenshotFile}` に配置される。
   * 命名規則: `{画面slug}--{状態slug}.png`
   */
  readonly screenshotFile: string;

  /** 画面構成のASCIIワイヤーフレーム（任意） */
  readonly wireframe?: string;

  /** UX改善メモ（任意） */
  readonly uxNotes?: string;
}

/** ナビゲーション種別 */
export type NavigationType = 'tab' | 'modal' | 'stack' | 'layout';

/** 1つの画面の定義。 */
export interface ScreenDefinition {
  /** 画面名（例: "ダッシュボード"） */
  readonly name: string;

  /** Expo Router のルートパス（例: "/(tabs)/index"） */
  readonly route: string;

  /** ナビゲーション種別 */
  readonly type: NavigationType;

  /** ソースファイルのパス（プロジェクトルートからの相対パス） */
  readonly sourceFile: string;

  /** 画面の説明（1-2行） */
  readonly description: string;

  /** この画面が取りうる全状態 */
  readonly states: readonly ScreenState[];
}

/** UX改善候補。 */
export interface UxImprovementItem {
  /** 優先度 */
  readonly priority: 'P1' | 'P2' | 'P3';

  /** 改善内容の説明 */
  readonly description: string;
}

/** UI状態カタログ全体の定義。 */
export interface UiStateCatalog {
  /** 全画面の定義 */
  readonly screens: readonly ScreenDefinition[];

  /** UX改善候補 */
  readonly improvements: readonly UxImprovementItem[];
}
