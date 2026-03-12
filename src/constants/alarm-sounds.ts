export interface AlarmSound {
  readonly id: string;
  readonly nameKey: string;
  readonly fileName: string;
}

export const ALARM_SOUNDS: readonly AlarmSound[] = [
  {
    id: 'default',
    nameKey: 'alarmSounds.default',
    fileName: 'alarm.wav',
  },
  {
    id: 'chime',
    nameKey: 'alarmSounds.chime',
    fileName: 'chime.mp3',
  },
  {
    id: 'birds',
    nameKey: 'alarmSounds.birds',
    fileName: 'birds.mp3',
  },
  {
    id: 'bell',
    nameKey: 'alarmSounds.bell',
    fileName: 'bell.mp3',
  },
] as const;

export const DEFAULT_SOUND_ID = 'default';

export function getAlarmSound(id: string): AlarmSound {
  const found = ALARM_SOUNDS.find((s) => s.id === id);
  if (found !== undefined) return found;
  // biome-ignore lint/style/noNonNullAssertion: ALARM_SOUNDS always has at least one element
  return ALARM_SOUNDS[0]!;
}

/**
 * soundId を AlarmKit に渡す soundName (ファイル名) に変換する。
 *
 * 背景: AlarmKit の soundName に undefined を渡すと OS デフォルト音が使われる。
 * `'default'` は「OS デフォルト音を使う」という意味なので undefined を返す。
 * それ以外は ALARM_SOUNDS から fileName をルックアップする。
 *
 * この関数が soundId → soundName 変換の唯一の正規化ポイント。
 * alarm-scheduler.ts, session-lifecycle.ts, ネイティブ patch が消費する。
 * 新しいサウンドを追加したときも ALARM_SOUNDS に追加するだけで全箇所に反映される。
 */
export function toAlarmKitSoundName(soundId: string): string | undefined {
  if (soundId === DEFAULT_SOUND_ID) return undefined;
  const sound = ALARM_SOUNDS.find((s) => s.id === soundId);
  return sound?.fileName;
}
