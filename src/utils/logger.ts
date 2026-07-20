/**
 * console.error/warn の集約ラッパー。
 *
 * 背景: 起動時読み込み失敗・破損レコードのスキップ等を可視化するための
 * console 呼び出しが各ストアに散在し、そのたびに同じ biome-ignore コメントが
 * 繰り返されていた。ここに集約することで ignore コメントは1箇所だけで済み、
 * 呼び出し元は scope（ストア名等）+ メッセージ + 詳細情報を渡すだけでよい。
 */

export function logError(scope: string, message: string, detail?: unknown): void {
  // biome-ignore lint/suspicious/noConsole: console 出力の集約ポイント
  console.error(`[${scope}] ${message}`, detail);
}

export function logWarn(scope: string, message: string, detail?: unknown): void {
  // biome-ignore lint/suspicious/noConsole: console 出力の集約ポイント
  console.warn(`[${scope}] ${message}`, detail);
}
