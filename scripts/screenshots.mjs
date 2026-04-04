/**
 * 全画面のライブスクリーンショットを一括取得するスクリプト。
 *
 * 背景: Expo Web で動作しているアプリの各画面をブラウザ自動操作で巡回し、
 * スクリーンショットを /tmp/screenshots/ に保存する。
 * Claude の Chrome DevTools MCP や Read ツールで確認可能。
 *
 * 使い方:
 *   1. `pnpm web` で Expo Web dev server を起動
 *   2. `node scripts/screenshots.mjs` で全画面のスクショを取得
 *
 * 前提:
 *   - Playwright がインストール済み（pnpm add -D playwright）
 *   - Chrome がシステムにインストール済み
 */

import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.EXPO_WEB_URL || 'http://localhost:8081';
const OUTPUT_DIR = process.env.SCREENSHOT_DIR || '/tmp/screenshots';
const CHROME_PATH = process.env.CHROME_PATH || '/tmp/chrome-linux64/chrome';

// biome-ignore lint/suspicious/noConsole: CLI スクリプトのため console 出力は必須
const log = console.log;
// biome-ignore lint/suspicious/noConsole: CLI スクリプトのため console 出力は必須
const logError = console.error;

/** iPhone 14 Pro 相当のビューポート（393x852 @2x） */
const DEVICE = {
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 2,
  colorScheme: 'dark',
  isMobile: true,
  hasTouch: true,
};

/**
 * 巡回する画面の一覧。
 * name: スクリーンショットのファイル名に使用
 * path: Expo Router のルートパス
 */
const SCREENS = [
  { name: '01-onboarding', path: '/onboarding' },
  { name: '02-dashboard', path: '/' },
  { name: '03-settings', path: '/settings' },
  { name: '04-schedule', path: '/schedule' },
  { name: '05-target-edit', path: '/target-edit' },
  { name: '06-day-review', path: '/day-review' },
];

async function main() {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const launchOptions = {
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  };
  if (existsSync(CHROME_PATH)) {
    launchOptions.executablePath = CHROME_PATH;
  }

  const browser = await chromium.launch(launchOptions);

  // オンボーディング完了状態を設定するためのコンテキスト
  const context = await browser.newContext(DEVICE);

  // AsyncStorage にオンボーディング完了フラグを設定
  // （Web では localStorage がバックエンド）
  const setupPage = await context.newPage();
  await setupPage.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 90000 });
  await setupPage.evaluate(() => {
    localStorage.setItem('onboarding-completed', 'true');
  });
  await setupPage.close();

  log(`Taking screenshots of ${SCREENS.length} screens...`);
  log(`  Output: ${OUTPUT_DIR}/\n`);

  for (const screen of SCREENS) {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    try {
      const url = `${BASE_URL}${screen.path}`;
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(2000);

      const filepath = resolve(OUTPUT_DIR, `${screen.name}.png`);
      await page.screenshot({ path: filepath, fullPage: false });

      const status = errors.length > 0 ? `WARN (${errors.length} errors)` : 'OK';
      log(`  ${status} ${screen.name} -> ${screen.path}`);
      if (errors.length > 0) {
        for (const e of errors.slice(0, 3)) {
          log(`      ${e.substring(0, 120)}`);
        }
      }
    } catch (e) {
      log(`  FAIL ${screen.name} -> ${e.message.substring(0, 100)}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  log(`\nDone! Screenshots saved to ${OUTPUT_DIR}/`);
}

main().catch((e) => {
  logError('Fatal error:', e.message);
  process.exit(1);
});
