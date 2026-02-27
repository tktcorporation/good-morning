import { type AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';

// biome-ignore lint/suspicious/noConsole: Sound errors need logging for debugging
const logError = console.error;

let currentPlayer: AudioPlayer | null = null;

/**
 * オーディオセッションを設定する。
 * サイレントモードでも音を鳴らし、バックグラウンドでも再生を継続する。
 *
 * 呼び出し元: playAlarmSound()
 */
export async function configureAudioSession(): Promise<void> {
  await setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
  });
}

function getAssetSource(soundId: string): number {
  switch (soundId) {
    case 'chime':
      return require('../../assets/sounds/chime.mp3');
    case 'birds':
      return require('../../assets/sounds/birds.mp3');
    case 'bell':
      return require('../../assets/sounds/bell.mp3');
    default:
      return require('../../assets/sounds/alarm.wav');
  }
}

/**
 * アラーム音をループ再生する。
 * 既に再生中の場合は停止してから新しい音を再生する。
 *
 * expo-audio の createAudioPlayer は命令的に Player を生成し、
 * コンポーネントライフサイクル外（サービス層）で使えるため採用。
 *
 * 呼び出し元: app/wakeup/ (起床フロー画面)
 */
export async function playAlarmSound(soundId?: string): Promise<void> {
  try {
    await stopAlarmSound();
    await configureAudioSession();

    const player = createAudioPlayer(getAssetSource(soundId ?? 'default'));
    player.loop = true;
    player.volume = 1.0;
    player.play();

    currentPlayer = player;
  } catch (error) {
    logError('Failed to play alarm sound:', error);
  }
}

/**
 * アラーム音を停止し、プレーヤーを解放する。
 *
 * 呼び出し元: app/wakeup/ (TODO完了時、アラーム解除時)
 */
export async function stopAlarmSound(): Promise<void> {
  if (currentPlayer === null) {
    return;
  }
  try {
    currentPlayer.pause();
    currentPlayer.release();
  } catch (error) {
    logError('Failed to stop alarm sound:', error);
  } finally {
    currentPlayer = null;
  }
}

export function isPlaying(): boolean {
  return currentPlayer !== null;
}
