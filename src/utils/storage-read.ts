import AsyncStorage from '@react-native-async-storage/async-storage';

const DEFAULT_READ_ATTEMPTS = 3;

/**
 * AsyncStorage.getItem をリトライ付きで実行する。
 *
 * cold-start 直後はネイティブブリッジの初期化競合などで一時的に reject
 * することがある。1 回の失敗だけで「読み取れない」と確定させると、
 * 実際にはストレージ上に残っている記録・セッションを「存在しない」ものとして
 * 扱ってしまい、その状態で loaded=true にして以降の永続化処理を進めると
 * 空データで実データを上書き消失させてしまう。数回リトライしても失敗する
 * 場合のみ呼び出し元に例外を投げる（呼び出し元は「未確定」として
 * loaded=false のまま保持し、永続化処理を進めない責務を持つ）。
 */
export async function readStorageItemWithRetry(
  key: string,
  attempts: number = DEFAULT_READ_ATTEMPTS,
): Promise<string | null> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await AsyncStorage.getItem(key);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
