import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

import type { ExpoSkyVisionModule as ExpoSkyVisionModuleType } from './ExpoSkyVision.types';

/**
 * iOS 専用（Vision framework 依存）。tsconfig に moduleSuffixes 設定が無く
 * `.native.ts`/`.web.ts` のプラットフォーム別ファイル解決が効かないため、
 * ファイル分割ではなく実行時の Platform.OS 分岐で切り替える。
 */
const ExpoSkyVisionModule: ExpoSkyVisionModuleType =
  Platform.OS === 'ios'
    ? requireNativeModule<ExpoSkyVisionModuleType>('ExpoSkyVision')
    : {
        classifyImageAsync() {
          return Promise.reject(new Error('ExpoSkyVision is only available on iOS.'));
        },
      };

export default ExpoSkyVisionModule;
