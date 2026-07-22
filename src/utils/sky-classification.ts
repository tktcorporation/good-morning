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

/** 分類結果の中に、閾値以上の信頼度を持つ空関連ラベルが1件でもあれば true。 */
export function isSkyClassification(
  classifications: readonly NativeImageClassification[],
): boolean {
  return classifications.some((c) => {
    if (c.confidence < SKY_CONFIDENCE_THRESHOLD) return false;
    const identifier = c.identifier.toLowerCase();
    return SKY_KEYWORDS.some((keyword) => identifier.includes(keyword));
  });
}
