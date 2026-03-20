/**
 * オーディオ再生を抽象化する Effect サービス。
 *
 * 背景: sound.ts がグローバル変数 currentPlayer でステートを管理し、
 * try-catch でエラーを握り潰していた。Effect サービスにすることで
 * エラーが SoundError として型追跡される。
 *
 * 呼び出し元: app/wakeup.tsx（アラーム音再生/停止）
 */

import { Context, Effect, Layer } from 'effect';
import { type AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { SoundError } from './errors';

// ─── サービスインターフェース ────────────────────────────────────

export interface SoundService {
  /** アラーム音をループ再生する。既に再生中なら停止してから再生。 */
  readonly playAlarm: (soundId?: string) => Effect.Effect<void, SoundError>;
  /** アラーム音を停止してプレーヤーを解放する */
  readonly stopAlarm: Effect.Effect<void, SoundError>;
}

export class Sound extends Context.Tag('Sound')<Sound, SoundService>() {}

// ─── expo-audio 実装 Layer ──────────────────────────────────────

function getAssetSource(soundId: string): number {
  switch (soundId) {
    case 'chime':
      return require('../../../assets/sounds/chime.mp3');
    case 'birds':
      return require('../../../assets/sounds/birds.mp3');
    case 'bell':
      return require('../../../assets/sounds/bell.mp3');
    default:
      return require('../../../assets/sounds/alarm.wav');
  }
}

export const SoundLive = Layer.sync(Sound, () => {
  let currentPlayer: AudioPlayer | null = null;

  const stopCurrent = Effect.try({
    try: () => {
      if (currentPlayer !== null) {
        currentPlayer.pause();
        currentPlayer.release();
        currentPlayer = null;
      }
    },
    catch: (cause) => new SoundError({ operation: 'stop', cause }),
  });

  return Sound.of({
    playAlarm: (soundId) =>
      Effect.gen(function* () {
        yield* stopCurrent;
        yield* Effect.try({
          try: () => {
            setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true });
          },
          catch: (cause) => new SoundError({ operation: 'configure', cause }),
        });
        yield* Effect.try({
          try: () => {
            const player = createAudioPlayer(getAssetSource(soundId ?? 'default'));
            player.loop = true;
            player.volume = 1.0;
            player.play();
            currentPlayer = player;
          },
          catch: (cause) => new SoundError({ operation: 'play', cause }),
        });
      }),

    stopAlarm: stopCurrent,
  });
});
