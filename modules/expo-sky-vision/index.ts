import ExpoSkyVisionModule from './src/ExpoSkyVisionModule';

export type { NativeImageClassification } from './src/ExpoSkyVision.types';

/** 画像を Vision framework のシーン分類器にかけ、ラベルと信頼度の一覧を返す。 */
export function classifyImageAsync(
  imageUri: string,
): ReturnType<typeof ExpoSkyVisionModule.classifyImageAsync> {
  return ExpoSkyVisionModule.classifyImageAsync(imageUri);
}
