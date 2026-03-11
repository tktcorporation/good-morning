import { useEffect, useState } from 'react';

/**
 * ISO datetime 文字列までのカウントダウンを M:SS 形式で返す。
 * 目標時刻を過ぎた場合は経過時間を返し、exceeded フラグを立てる。
 *
 * 背景: DashboardScreen の認知複雑度を下げるためタイマーロジックを分離。
 * スヌーズカウントダウンと起床目標カウントダウンの両方で使用する。
 *
 * @param targetTime - カウントダウン対象の ISO datetime 文字列。null の場合は非表示。
 * @param allowExceed - true の場合、超過後も経過時間を表示し続ける。false の場合は超過後 null に戻る。
 */
export function useCountdown(
  targetTime: string | null,
  allowExceed = false,
): { remaining: string | null; exceeded: boolean } {
  const [remaining, setRemaining] = useState<string | null>(null);
  const [exceeded, setExceeded] = useState(false);

  useEffect(() => {
    if (targetTime === null) {
      setRemaining(null);
      setExceeded(false);
      return;
    }
    const update = () => {
      const diff = new Date(targetTime).getTime() - Date.now();
      if (diff <= 0 && !allowExceed) {
        setRemaining(null);
        return;
      }
      const absDiff = Math.abs(diff);
      const mins = Math.floor(absDiff / 60000);
      const secs = Math.floor((absDiff % 60000) / 1000);
      setRemaining(`${mins}:${secs.toString().padStart(2, '0')}`);
      setExceeded(diff <= 0);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [targetTime, allowExceed]);

  return { remaining, exceeded };
}
