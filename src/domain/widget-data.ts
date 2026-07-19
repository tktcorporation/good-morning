/**
 * ウィジェット表示用データの組み立て純粋関数。
 *
 * 背景: ホームウィジェット（Widget Extension）にアラーム・セッション・ストリーク情報を
 * 表示するため、全ストアの状態を WidgetData に変換する。
 * ストアの getState() を呼んでデータを組み立てるだけの純粋関数。
 * 実際の App Groups 書き込み（副作用）は WidgetSyncService が担当する。
 *
 * 呼び出し元: services/effect/WidgetSyncService.ts, background-sync
 */

import { useDailyGradeStore } from '../stores/daily-grade-store';
import { useMorningSessionStore } from '../stores/morning-session-store';
import { useSettingsStore } from '../stores/settings-store';
import { useWakeTargetStore } from '../stores/wake-target-store';
import type { DayOfWeek } from '../types/alarm';
import { formatTime } from '../types/alarm';
import { resolveNextAlarmDate, resolveNextAlarmTime } from '../types/wake-target';
import type { WidgetData } from '../types/widget-data';
import { getLocalizedTodoTitle } from '../utils/todo-display';

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
  const { dayBoundaryHour } = useSettingsStore.getState();

  // --- nextAlarm ---
  // resolveTimeForDate(target, now) だけだと「今日」の予定を返すのみで、
  // 今日のアラームを消化した後（夕方以降）も同じ時刻を表示し続け、翌日に
  // 予定された nextOverride が反映されない。resolveNextAlarmTime/Date で
  // 実際に次に鳴るアラームの時刻・曜日を解決する
  let nextAlarm: WidgetData['nextAlarm'] = null;
  if (target !== null) {
    const now = new Date();
    const alarmTime = resolveNextAlarmTime(target, now, dayBoundaryHour);
    const alarmDate = resolveNextAlarmDate(target, now, dayBoundaryHour);
    if (alarmTime !== null && alarmDate !== null) {
      nextAlarm = {
        time: formatTime(alarmTime),
        enabled: target.enabled,
        label: DAY_LABELS[alarmDate.getDay() as DayOfWeek],
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
        title: getLocalizedTodoTitle(t),
        completed: t.completed,
      })),
      snoozeFiresAt: sessionState.session.snoozeFiresAt,
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
