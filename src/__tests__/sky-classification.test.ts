import { isSkyClassification, SKY_CONFIDENCE_THRESHOLD } from '../utils/sky-classification';

describe('isSkyClassification', () => {
  it('空関連ラベルが閾値以上の信頼度で含まれていれば true を返す', () => {
    expect(isSkyClassification([{ identifier: 'Sky', confidence: 0.8 }])).toBe(true);
  });

  it('大文字小文字を無視して一致する', () => {
    expect(isSkyClassification([{ identifier: 'BLUE_SKY', confidence: 0.4 }])).toBe(true);
  });

  it('複合語ラベル（night_sky, sunset_sunrise, cloudy）にも一致する', () => {
    expect(isSkyClassification([{ identifier: 'night_sky', confidence: 0.5 }])).toBe(true);
    expect(isSkyClassification([{ identifier: 'sunset_sunrise', confidence: 0.3 }])).toBe(true);
    expect(isSkyClassification([{ identifier: 'cloudy', confidence: 0.3 }])).toBe(true);
  });

  it('信頼度が閾値ちょうどなら true を返す（境界値）', () => {
    expect(isSkyClassification([{ identifier: 'sky', confidence: SKY_CONFIDENCE_THRESHOLD }])).toBe(
      true,
    );
  });

  it('信頼度が閾値未満なら false を返す', () => {
    expect(
      isSkyClassification([{ identifier: 'sky', confidence: SKY_CONFIDENCE_THRESHOLD - 0.01 }]),
    ).toBe(false);
  });

  it('空と無関係なラベルのみでは信頼度が高くても false を返す', () => {
    expect(isSkyClassification([{ identifier: 'dog', confidence: 0.9 }])).toBe(false);
  });

  it('分類結果が空配列なら false を返す', () => {
    expect(isSkyClassification([])).toBe(false);
  });

  it('複数ラベルのうち1件でも空関連＆閾値以上なら true を返す', () => {
    expect(
      isSkyClassification([
        { identifier: 'dog', confidence: 0.9 },
        { identifier: 'cloudy', confidence: 0.2 },
      ]),
    ).toBe(true);
  });

  it('複数ラベルが全て閾値未満なら false を返す', () => {
    expect(
      isSkyClassification([
        { identifier: 'sky', confidence: 0.05 },
        { identifier: 'cloudy', confidence: 0.05 },
      ]),
    ).toBe(false);
  });

  it('複数ラベルが全て空と無関係なら false を返す', () => {
    expect(
      isSkyClassification([
        { identifier: 'dog', confidence: 0.9 },
        { identifier: 'cat', confidence: 0.9 },
      ]),
    ).toBe(false);
  });

  it('信頼度が NaN なら false を返す（不正値をフェイルセーフに扱う）', () => {
    expect(isSkyClassification([{ identifier: 'sky', confidence: Number.NaN }])).toBe(false);
  });

  it.each([
    'sky',
    'blue_sky',
    'night_sky',
    'sunset_sunrise',
    'cloudy',
  ])('Vision の実ラベル "%s" に一致する', (identifier) => {
    expect(isSkyClassification([{ identifier, confidence: 0.5 }])).toBe(true);
  });

  it.each([
    'skyscraper',
    'skydiving',
    'husky',
  ])('空関連キーワードを部分文字列として含むだけの無関係なラベル "%s" には一致しない（完全一致チェック）', (identifier) => {
    expect(isSkyClassification([{ identifier, confidence: 0.9 }])).toBe(false);
  });
});
