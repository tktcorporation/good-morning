import {
  ALARM_SOUNDS,
  DEFAULT_SOUND_ID,
  getAlarmSound,
  toAlarmKitSoundName,
} from '../constants/alarm-sounds';

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

describe('toAlarmKitSoundName', () => {
  it('returns undefined for default soundId (OS default sound)', () => {
    expect(toAlarmKitSoundName('default')).toBeUndefined();
  });

  it('returns fileName from ALARM_SOUNDS for known soundId', () => {
    expect(toAlarmKitSoundName('chime')).toBe('chime.mp3');
    expect(toAlarmKitSoundName('birds')).toBe('birds.mp3');
    expect(toAlarmKitSoundName('bell')).toBe('bell.mp3');
  });

  it('returns undefined for unknown soundId', () => {
    expect(toAlarmKitSoundName('nonexistent')).toBeUndefined();
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
