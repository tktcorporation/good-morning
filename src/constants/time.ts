/**
 * 時刻・期間計算で使う数値定数の単一定義（SSOT）。
 *
 * 「分/日 = 1440」のようなマジックナンバーが複数ファイルに散在すると、
 * 意味の取り違えや片側だけの修正を招く。深夜跨ぎ補正・期間計算で共有する
 * 定数をここに集約する。
 *
 * 自明な基礎値（時/分、日/時、分/ミリ秒）は導出のための内部値に留め、
 * 取り違えやすい合成値（分/日・半日分・ミリ秒/日）だけを公開する。
 */

const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const MS_PER_MINUTE = 60 * 1000;

/** 1 日の分数。深夜を跨ぐ時刻差の補正（±1440）に使う。 */
export const MINUTES_PER_DAY = HOURS_PER_DAY * MINUTES_PER_HOUR;

/** 半日の分数。時刻差を「より近い側」に畳む閾値（±720 を超えたら逆回り）。 */
export const HALF_DAY_MINUTES = MINUTES_PER_DAY / 2;

/** 1 日のミリ秒数。日数差の算出に使う。 */
export const MS_PER_DAY = MINUTES_PER_DAY * MS_PER_MINUTE;
