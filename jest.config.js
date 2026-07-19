// jest-expo preset に乗せることで、pnpm の hoisting (`node_modules/.pnpm/...`) や
// React Native 0.83 の Flow 構文 (`import typeof`) を含む node_modules を
// 正しく transform できる。独自の transformIgnorePatterns は pnpm の階層に
// マッチしないため、画面ファイルを require するスモークテストが落ちていた。
const expoPreset = require('jest-expo/jest-preset');

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // CI の test ジョブは早期skip判定で app/ と src/ の変更有無しか見ていないため、
  // Jest がテストを探す範囲をこの2つに揃えておく。ここを広げる場合は
  // .github/workflows/ci.yml の test ジョブの判定対象パスも合わせて広げること。
  roots: ['<rootDir>/app', '<rootDir>/src'],
  moduleNameMapper: {
    ...(expoPreset.moduleNameMapper ?? {}),
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // preset が追加する setupFiles に加えて、プロジェクト独自のモック (jest.setup.js) を後ろに足す。
  // 上書きしてしまうと preset 側のネイティブモジュールスタブが効かなくなる。
  setupFiles: [...(expoPreset.setupFiles ?? []), './jest.setup.js'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};
