/** Vision framework のシーン分類結果1件。identifier は英語のラベル文字列。 */
export interface NativeImageClassification {
  identifier: string;
  confidence: number;
}

export interface ExpoSkyVisionModule {
  /**
   * minConfidence を渡すと、その信頼度未満の分類結果はネイティブ側で除外されて
   * 返る（ブリッジを渡るペイロードを抑えるため）。省略時は全件返る。
   */
  classifyImageAsync(
    imageUri: string,
    minConfidence?: number,
  ): Promise<NativeImageClassification[]>;
}
