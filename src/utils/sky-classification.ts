import type { NativeImageClassification } from 'expo-sky-vision';

/**
 * VNClassifyImageRequest は数千クラスに及ぶ多クラス分類のため、各ラベルの信頼度が
 * 単独では高い値にならないことが多い。閾値を低めに設定し、実ラベル一致と
 * 組み合わせて空判定の実用的な感度を確保する。
 */
export const SKY_CONFIDENCE_THRESHOLD = 0.15;

/**
 * VNClassifyImageRequestRevision1 の分類語彙のうち、空・天候に対応する識別子。
 * 複合語は '_' で連結される(blue_sky, night_sky, sunset_sunrise)。この語彙は
 * `VNClassifyImageRequest.knownClassifications(forRevision:)` で列挙可能なため、
 * 部分一致ではなく実ラベルとの完全一致で判定する
 * (skyscraper / skydiving / husky のような無関係ラベルとの誤マッチを避けるため)。
 */
const SKY_IDENTIFIERS = new Set(['sky', 'blue_sky', 'night_sky', 'sunset_sunrise', 'cloudy']);

/** 分類結果の中に、閾値以上の信頼度を持つ空関連ラベルが1件でもあれば true。 */
export function isSkyClassification(
  classifications: readonly NativeImageClassification[],
): boolean {
  return classifications.some((c) => {
    if (!Number.isFinite(c.confidence) || c.confidence < SKY_CONFIDENCE_THRESHOLD) return false;
    return SKY_IDENTIFIERS.has(c.identifier.toLowerCase());
  });
}
