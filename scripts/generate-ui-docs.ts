/**
 * UI状態カタログ (docs/ui-states.md) を Screen State Registry から自動生成する。
 *
 * 実行: pnpm generate:ui-docs
 *
 * Registry（src/docs/screen-states.ts）を読み取り、
 * 各画面・各状態の情報を markdown に変換して出力する。
 * docs/screenshots/ にスクリーンショットが存在する場合は画像リンクも挿入する。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { UI_STATE_CATALOG } from '../src/docs/screen-states';
import type { ScreenDefinition, ScreenState, UxImprovementItem } from '../src/docs/types';

const DOCS_DIR = path.resolve(__dirname, '..', 'docs');
const SCREENSHOTS_DIR = path.join(DOCS_DIR, 'screenshots');
const OUTPUT_FILE = path.join(DOCS_DIR, 'ui-states.md');

/** スクリーンショットファイルが存在するか確認する */
function screenshotExists(filename: string): boolean {
  return fs.existsSync(path.join(SCREENSHOTS_DIR, filename));
}

/** ナビゲーション種別の日本語表記 */
function typeLabel(type: ScreenDefinition['type']): string {
  const labels: Record<ScreenDefinition['type'], string> = {
    tab: 'タブ',
    modal: 'モーダル',
    stack: 'スタック',
    layout: 'レイアウト',
  };
  return labels[type];
}

/** 画面一覧テーブルを生成する */
function generateOverviewTable(screens: readonly ScreenDefinition[]): string {
  const rows = screens.map(
    (screen, i) =>
      `| ${i + 1} | ${screen.name} | \`${screen.route}\` | ${typeLabel(screen.type)} | ${screen.states.length} |`,
  );
  return [
    '| # | 画面 | ルート | 種別 | 状態数 |',
    '|---|------|--------|------|--------|',
    ...rows,
  ].join('\n');
}

/** 1つの状態セクションを生成する */
function generateStateSection(state: ScreenState): string {
  const lines: string[] = [];

  lines.push(`#### ${state.name}`);
  lines.push('');
  lines.push(`- **条件**: \`${state.condition}\``);

  if (screenshotExists(state.screenshotFile)) {
    lines.push(`- **スクリーンショット**: ![${state.name}](screenshots/${state.screenshotFile})`);
  } else {
    lines.push(`- **スクリーンショット**: \`${state.screenshotFile}\` (未撮影)`);
  }

  if (state.wireframe !== undefined) {
    lines.push('');
    lines.push('```');
    lines.push(state.wireframe);
    lines.push('```');
  }

  if (state.uxNotes !== undefined) {
    lines.push('');
    lines.push(`> **UX メモ**: ${state.uxNotes}`);
  }

  return lines.join('\n');
}

/** 1つの画面セクションを生成する */
function generateScreenSection(screen: ScreenDefinition, index: number): string {
  const lines: string[] = [];

  lines.push(`## ${index + 1}. ${screen.name} (\`${screen.sourceFile}\`)`);
  lines.push('');
  lines.push(screen.description);
  lines.push('');

  // 状態一覧テーブル
  lines.push('### 状態一覧');
  lines.push('');
  lines.push('| 状態 | 条件 | スクリーンショット |');
  lines.push('|------|------|-------------------|');
  for (const state of screen.states) {
    const ssStatus = screenshotExists(state.screenshotFile)
      ? `[撮影済み](screenshots/${state.screenshotFile})`
      : `\`${state.screenshotFile}\``;
    lines.push(`| ${state.name} | \`${state.condition}\` | ${ssStatus} |`);
  }
  lines.push('');

  // 各状態の詳細
  for (const state of screen.states) {
    lines.push(generateStateSection(state));
    lines.push('');
  }

  lines.push('---');
  return lines.join('\n');
}

/** UX改善候補セクションを生成する */
function generateImprovements(items: readonly UxImprovementItem[]): string {
  const lines: string[] = [];
  lines.push('## UX 改善候補');
  lines.push('');

  const grouped: Record<string, UxImprovementItem[]> = {};
  for (const item of items) {
    if (grouped[item.priority] === undefined) {
      grouped[item.priority] = [];
    }
    grouped[item.priority].push(item);
  }

  const priorityLabels: Record<string, string> = {
    P1: '高優先度',
    P2: '中優先度',
    P3: '低優先度',
  };

  for (const priority of ['P1', 'P2', 'P3']) {
    const group = grouped[priority];
    if (group === undefined || group.length === 0) continue;

    lines.push(`### ${priority}: ${priorityLabels[priority]}`);
    lines.push('');
    for (const item of group) {
      lines.push(`- ${item.description}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/** メインの生成関数 */
function generate(): void {
  const { screens, improvements } = UI_STATE_CATALOG;

  const totalStates = screens.reduce((sum, s) => sum + s.states.length, 0);
  const capturedCount = screens
    .flatMap((s) => s.states)
    .filter((state) => screenshotExists(state.screenshotFile)).length;

  const lines: string[] = [];

  // ヘッダー
  lines.push('# UI 状態カタログ');
  lines.push('');
  lines.push('> **このファイルは自動生成されています。** 直接編集しないでください。');
  lines.push('> ソース: `src/docs/screen-states.ts` → `pnpm generate:ui-docs` で再生成');
  lines.push('');
  lines.push(
    `全 ${screens.length} 画面・${totalStates} 状態 | スクリーンショット: ${capturedCount}/${totalStates} 撮影済み`,
  );
  lines.push('');
  lines.push('---');
  lines.push('');

  // 画面一覧
  lines.push('## 画面一覧');
  lines.push('');
  lines.push(generateOverviewTable(screens));
  lines.push('');
  lines.push('---');
  lines.push('');

  // 各画面セクション
  for (let i = 0; i < screens.length; i++) {
    const screen = screens[i];
    if (screen !== undefined) {
      lines.push(generateScreenSection(screen, i));
      lines.push('');
    }
  }

  // UX改善候補
  lines.push(generateImprovements(improvements));

  // フッター
  lines.push('---');
  lines.push('');
  lines.push(
    `*Generated at ${new Date().toISOString().slice(0, 19)} from \`src/docs/screen-states.ts\`*`,
  );
  lines.push('');

  fs.writeFileSync(OUTPUT_FILE, lines.join('\n'), 'utf-8');

  const relativePath = path.relative(path.resolve(__dirname, '..'), OUTPUT_FILE);
  console.log(`✅ ${relativePath} を生成しました`);
  console.log(
    `   ${screens.length} 画面 / ${totalStates} 状態 / ${capturedCount} スクリーンショット`,
  );
}

generate();
