/** Vision framework のシーン分類結果1件。identifier は英語のラベル文字列。 */
export interface NativeImageClassification {
  identifier: string;
  confidence: number;
}

export interface ExpoSkyVisionModule {
  classifyImageAsync(imageUri: string): Promise<NativeImageClassification[]>;
}
