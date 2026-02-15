import { Audio } from 'expo-av';

// biome-ignore lint/suspicious/noConsole: Sound errors need logging for debugging
const logError = console.error;

let currentSound: Audio.Sound | null = null;

export async function configureAudioSession(): Promise<void> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: true,
    shouldDuckAndroid: false,
  });
}

export async function playAlarmSound(): Promise<void> {
  try {
    await stopAlarmSound();
    await configureAudioSession();

    const { sound } = await Audio.Sound.createAsync(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../../assets/sounds/alarm.wav'),
      {
        isLooping: true,
        volume: 1.0,
        shouldPlay: true,
      },
    );

    currentSound = sound;
  } catch (error) {
    logError('Failed to play alarm sound:', error);
  }
}

export async function stopAlarmSound(): Promise<void> {
  if (currentSound === null) {
    return;
  }
  try {
    await currentSound.stopAsync();
    await currentSound.unloadAsync();
  } catch (error) {
    logError('Failed to stop alarm sound:', error);
  } finally {
    currentSound = null;
  }
}

export function isPlaying(): boolean {
  return currentSound !== null;
}
