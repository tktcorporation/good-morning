import { CameraView, useCameraPermissions } from 'expo-camera';
import { classifyImageAsync } from 'expo-sky-vision';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, fontSize, semanticColors, spacing } from '../constants/theme';
import type { SessionTodo } from '../types/morning-session';
import { isSkyClassification } from '../utils/sky-classification';

interface SkyChallengeItemProps {
  readonly todo: SessionTodo;
  /** 空判定成功時に呼ばれる。ストアの completeSkyTodo を渡す。 */
  readonly onComplete: (id: string) => void;
}

type CaptureStatus = 'idle' | 'capturing' | 'classifying' | 'failed';

/**
 * 空撮影チャレンジの UI。カメラでシャッターを切り、端末上の Vision framework による
 * 画像分類（空関連ラベルの検出）に成功すると完了になる。
 *
 * 背景: チェックボックスタップだけでは寝ぼけたまま完了できてしまうため、
 * 実際にカメラで外を撮影したことを端末上の判定で確認するフィジカルチャレンジを提供する。
 */
export function SkyChallengeItem({ todo, onComplete }: SkyChallengeItemProps) {
  const { t } = useTranslation('dashboard');
  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState<CaptureStatus>('idle');
  const cameraRef = useRef<CameraView>(null);

  const handleOpenCamera = useCallback(async () => {
    if (permission?.granted !== true) {
      const result = await requestPermission();
      if (!result.granted) return;
    }
    setStatus('capturing');
  }, [permission, requestPermission]);

  const handleCapture = useCallback(async () => {
    const camera = cameraRef.current;
    if (camera === null) return;
    setStatus('classifying');
    try {
      const photo = await camera.takePictureAsync({ quality: 0.5 });
      const classifications = await classifyImageAsync(photo.uri);
      if (isSkyClassification(classifications)) {
        onComplete(todo.id);
      } else {
        setStatus('failed');
      }
    } catch {
      setStatus('failed');
    }
  }, [onComplete, todo.id]);

  if (todo.completed) {
    return (
      <View style={[styles.container, styles.containerCompleted]}>
        <Text style={styles.emoji}>{'\u{1F324}️'}</Text>
        <View style={styles.info}>
          <Text style={[styles.title, styles.titleCompleted]}>{t('morningRoutine.sky.title')}</Text>
          <Text style={styles.doneLabel}>{t('morningRoutine.sky.done')}</Text>
        </View>
      </View>
    );
  }

  if (status === 'capturing' || status === 'classifying') {
    return (
      <View style={styles.cameraCard}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back" />
        {status === 'classifying' ? (
          <View style={styles.overlay}>
            <ActivityIndicator color={colors.text} />
            <Text style={styles.overlayText}>{t('morningRoutine.sky.classifying')}</Text>
          </View>
        ) : (
          <Pressable
            style={styles.shutterButton}
            onPress={handleCapture}
            accessibilityLabel={t('morningRoutine.sky.shutter')}
          >
            <View style={styles.shutterInner} />
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>{'\u{1F324}️'}</Text>
      <View style={styles.info}>
        <Text style={styles.title}>{t('morningRoutine.sky.title')}</Text>
        <Text style={status === 'failed' ? styles.failedText : styles.waitingText}>
          {status === 'failed' ? t('morningRoutine.sky.failed') : t('morningRoutine.sky.waiting')}
        </Text>
      </View>
      <Pressable style={styles.captureButton} onPress={handleOpenCamera}>
        <Text style={styles.captureButtonText}>
          {status === 'failed' ? t('morningRoutine.sky.retry') : t('morningRoutine.sky.openCamera')}
        </Text>
      </Pressable>
    </View>
  );
}

const CAMERA_SIZE = 220;
const SHUTTER_SIZE = 64;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  containerCompleted: {
    opacity: 0.7,
  },
  emoji: {
    fontSize: fontSize.xxl,
    marginRight: spacing.md,
  },
  info: {
    flex: 1,
  },
  title: {
    fontSize: fontSize.md,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  titleCompleted: {
    textDecorationLine: 'line-through',
    color: colors.textMuted,
  },
  doneLabel: {
    fontSize: fontSize.sm,
    color: colors.success,
    fontWeight: '600',
  },
  waitingText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  failedText: {
    fontSize: fontSize.sm,
    color: colors.warning,
  },
  captureButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  captureButtonText: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: '600',
  },
  cameraCard: {
    width: CAMERA_SIZE,
    height: CAMERA_SIZE,
    alignSelf: 'center',
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semanticColors.overlay,
  },
  overlayText: {
    marginTop: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  shutterButton: {
    position: 'absolute',
    bottom: spacing.md,
    alignSelf: 'center',
    width: SHUTTER_SIZE,
    height: SHUTTER_SIZE,
    borderRadius: borderRadius.full,
    borderWidth: 4,
    borderColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: SHUTTER_SIZE - 16,
    height: SHUTTER_SIZE - 16,
    borderRadius: borderRadius.full,
    backgroundColor: colors.text,
  },
});
