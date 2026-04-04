/**
 * 全画面のライブスクリーンショットを一括取得するスクリプト。
 *
 * 背景: Expo Web で動作しているアプリの各画面をブラウザ自動操作で巡回し、
 * スクリーンショットを /tmp/screenshots/ に保存する。
 * Claude の Chrome DevTools MCP や Read ツールで確認可能。
 *
 * 使い方:
 *   pnpm screenshots        # サーバー起動 → 撮影 → 停止をワンコマンドで実行
 *   pnpm screenshots:only   # 既に pnpm web で起動中の場合、撮影のみ
 *
 * 前提:
 *   - Playwright がインストール済み（pnpm add -D playwright）
 *   - Chrome がシステムにインストール済み
 *
 * 環境変数:
 *   EXPO_WEB_URL     - dev server の URL（デフォルト: http://localhost:8081）
 *   SCREENSHOT_DIR   - 出力先（デフォルト: /tmp/screenshots）
 *   CHROME_PATH      - Chrome のパス
 *   SKIP_SERVER      - "true" でサーバー起動をスキップ（既に起動中の場合）
 */

import { execFile } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.EXPO_WEB_URL || 'http://localhost:8081';
const OUTPUT_DIR = process.env.SCREENSHOT_DIR || '/tmp/screenshots';
const CHROME_PATH = process.env.CHROME_PATH || '/tmp/chrome-linux64/chrome';
const SKIP_SERVER = process.env.SKIP_SERVER === 'true';

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

/**
 * URL にリクエストを送り、200 が返るまでポーリングする。
 * Expo Web の Metro bundler は起動に時間がかかるため、
 * 初回バンドルが完了するまで最大 2 分待つ。
 */
async function waitForServer(url, maxRetries = 40, intervalMs = 3000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // サーバーがまだ起動していない
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Server did not start within ${(maxRetries * intervalMs) / 1000}s`);
}

/**
 * Expo Web dev server を子プロセスとして起動する。
 * execFile を使いシェルインジェクションを防止。
 * 撮影完了後に kill するため、プロセス参照を返す。
 */
function startExpoWeb() {
  const child = execFile('npx', ['expo', 'start', '--web', '--port', '8081'], {
    cwd: process.cwd(),
    env: { ...process.env, BROWSER: 'none' },
  });
  // 子プロセスの出力はデバッグ時のみ必要なので、デフォルトでは捨てる
  child.stdout?.resume();
  child.stderr?.resume();
  return child;
}

async function takeScreenshots() {
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

async function main() {
  let serverProcess = null;

  try {
    if (SKIP_SERVER) {
      log('SKIP_SERVER=true: using existing server');
    } else {
      log('Starting Expo Web dev server...');
      serverProcess = startExpoWeb();
      await waitForServer(BASE_URL);
      log('Server ready.\n');
    }

    await takeScreenshots();
  } finally {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
    }
  }
}

main().catch((e) => {
  logError('Fatal error:', e.message);
  process.exit(1);
});
