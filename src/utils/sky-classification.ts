import type { NativeImageClassification } from 'expo-sky-vision';

/**
 * VNClassifyImageRequest は数千クラスに及ぶ多クラス分類のため、各ラベルの信頼度が
 * 単独では高い値にならないことが多い。閾値を低めに設定し、キーワード一致と
 * 組み合わせて空判定の実用的な感度を確保する。
 */
export const SKY_CONFIDENCE_THRESHOLD = 0.15;

const SKY_KEYWORDS = [
  'sky',
  'cloud',
  'sunset',
  'sunrise',
  'horizon',
  'cumulus',
  'overcast',
  'dusk',
  'dawn',
] as const;

/**
 * 単語境界付きでマッチする（例: "sky" は "cloudy sky" にマッチするが、
 * "skyscraper"（ビル）や "skydiving" のような空と無関係なラベルの部分文字列としては
 * マッチしない）。VNClassifyImageRequest の分類語彙は OS 提供でこちらから
 * 列挙・制御できないため、部分一致だと無関係な被写体を空と誤判定しうる。
 */
const SKY_KEYWORD_PATTERNS = SKY_KEYWORDS.map((keyword) => new RegExp(`\\b${keyword}\\b`));

/** 分類結果の中に、閾値以上の信頼度を持つ空関連ラベルが1件でもあれば true。 */
export function isSkyClassification(
  classifications: readonly NativeImageClassification[],
): boolean {
  return classifications.some((c) => {
    if (!Number.isFinite(c.confidence) || c.confidence < SKY_CONFIDENCE_THRESHOLD) return false;
    const identifier = c.identifier.toLowerCase();
    return SKY_KEYWORD_PATTERNS.some((pattern) => pattern.test(identifier));
  });
}
