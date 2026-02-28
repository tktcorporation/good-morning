/**
 * ウィジェットデータの組み立てと App Groups UserDefaults への同期サービス。
 *
 * 背景: ホームウィジェット（Widget Extension）にアラーム・セッション・ストリーク情報を
 * 表示するため、全ストアの状態を WidgetData に変換して UserDefaults に書き出す。
 * ストア変更時に fire-and-forget で呼ばれ、失敗してもアプリ動作に影響しない。
 *
 * 呼び出し元: 各ストアの変更メソッド、background-sync タスク、_layout.tsx の初期化
 */

import { useDailyGradeStore } from '../stores/daily-grade-store';
import { useMorningSessionStore } from '../stores/morning-session-store';
import { useWakeTargetStore } from '../stores/wake-target-store';
import type { DayOfWeek } from '../types/alarm';
import { formatTime } from '../types/alarm';
import { resolveTimeForDate } from '../types/wake-target';
import type { WidgetData } from '../types/widget-data';
import { reloadWidgetTimelines, syncWidgetData } from './alarm-kit';

/** 曜日インデックス → 短縮ラベル。i18n は Widget Extension 側で不使用のため固定値。 */
const DAY_LABELS: Record<DayOfWeek, string> = {
  0: '日',
  1: '月',
  2: '火',
  3: '水',
  4: '木',
  5: '金',
  6: '土',
};

/**
 * 全ストアの現在状態から WidgetData を組み立てる。
 * ストア外から呼べるようにステートレスな pure 関数として実装。
 */
export function buildWidgetData(): WidgetData {
  const target = useWakeTargetStore.getState().target;
  const sessionState = useMorningSessionStore.getState();
  const { streak } = useDailyGradeStore.getState();

  // --- nextAlarm ---
  let nextAlarm: WidgetData['nextAlarm'] = null;
  if (target !== null) {
    const now = new Date();
    const alarmTime = resolveTimeForDate(target, now);
    if (alarmTime !== null) {
      nextAlarm = {
        time: formatTime(alarmTime),
        enabled: target.enabled,
        label: DAY_LABELS[now.getDay() as DayOfWeek],
      };
    }
  }

  // --- session ---
  let session: WidgetData['session'] = null;
  if (sessionState.session !== null) {
    const { completed, total } = sessionState.getProgress();
    session = {
      todos: sessionState.session.todos.map((t) => ({
        id: t.id,
        title: t.title,
        completed: t.completed,
      })),
      snoozeFiresAt: sessionState.snoozeFiresAt,
      progress: { completed, total },
    };
  }

  return {
    nextAlarm,
    session,
    streak: {
      currentStreak: streak.currentStreak,
      lastGrade:
        streak.lastGradedDate !== null
          ? (useDailyGradeStore.getState().getGradeForDate(streak.lastGradedDate)?.grade ?? 'poor')
          : 'poor',
    },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * ウィジェットデータを App Groups UserDefaults に同期し、タイムラインを更新する。
 * ストア変更のコールバックから fire-and-forget で呼ぶ。
 * 失敗してもアプリ動作に影響しないため、エラーはログのみ。
 */
export async function syncWidget(): Promise<void> {
  const data = buildWidgetData();
  await syncWidgetData(JSON.stringify(data));
  await reloadWidgetTimelines();
}
