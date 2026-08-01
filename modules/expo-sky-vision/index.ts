import ExpoSkyVisionModule from './src/ExpoSkyVisionModule';

export type { NativeImageClassification } from './src/ExpoSkyVision.types';

/**
 * 画像を Vision framework のシーン分類器にかけ、ラベルと信頼度の一覧を返す。
 * minConfidence を渡すと、その信頼度未満の結果はネイティブ側で除外される
 * (Vision の分類語彙は約1300件あり、毎回全件返すとブリッジのペイロードが
 * 大きくなるため)。
 *
 * 分類後、`imageUri` が指すファイルは端末上から削除される（撮影のたびに
 * キャッシュへ蓄積するのを防ぐため）。呼び出し元がこの URI を分類後も
 * 使い続けたい場合は、呼び出し前に別途コピーを取っておくこと。
 */
export function classifyImageAsync(
  imageUri: string,
  minConfidence?: number,
): ReturnType<typeof ExpoSkyVisionModule.classifyImageAsync> {
  return ExpoSkyVisionModule.classifyImageAsync(imageUri, minConfidence);
}
