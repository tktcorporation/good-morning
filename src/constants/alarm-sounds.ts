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
