import { ALARM_SOUNDS, DEFAULT_SOUND_ID, getAlarmSound } from '../constants/alarm-sounds';

describe('getAlarmSound', () => {
  it('returns correct sound by id', () => {
    const sound = getAlarmSound('chime');
    expect(sound.id).toBe('chime');
    expect(sound.nameKey).toBe('alarmSounds.chime');
    expect(sound.fileName).toBe('chime.mp3');
  });

  it('returns default for unknown id', () => {
    const sound = getAlarmSound('nonexistent');
    expect(sound.id).toBe(DEFAULT_SOUND_ID);
  });
});

describe('ALARM_SOUNDS', () => {
  it('has expected length', () => {
    expect(ALARM_SOUNDS).toHaveLength(4);
  });

  it('all sounds have required fields', () => {
    for (const sound of ALARM_SOUNDS) {
      expect(sound.id).toBeTruthy();
      expect(sound.nameKey).toBeTruthy();
      expect(sound.fileName).toBeTruthy();
    }
  });
});
