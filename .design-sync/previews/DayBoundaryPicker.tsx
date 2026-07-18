import { useEffect } from 'react';
import { View } from 'react-native';
import { DayBoundaryPicker } from 'good-morning';

/**
 * DayBoundaryPicker はボトムシートの開閉を内部 state で管理しており、外部から
 * 開いた状態を渡す prop は存在しない。プレビューではトリガー行を実クリックして
 * 開いた状態を撮影する（トリガーは初期表示で唯一の tabIndex=0 要素）。
 * コンポーネント本体は一切変更していない。
 */
function useAutoOpen() {
  useEffect(() => {
    // Modal は position:fixed で全画面を覆うため、半透明オーバーレイの背後に
    // 実際のアプリと同じダーク背景が見えるよう body 自体を塗る。
    document.body.style.backgroundColor = '#1a1a2e';
    const trigger = document.querySelector<HTMLElement>('[tabindex="0"]');
    trigger?.click();
  }, []);
}

// --- 閉じた状態（トリガー行のみ）---

export function ClosedAt6() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <DayBoundaryPicker value={6} onValueChange={() => {}} />
    </View>
  );
}

export function ClosedAtMidnight() {
  return (
    <View style={{ padding: 16, backgroundColor: '#1a1a2e' }}>
      <DayBoundaryPicker value={0} onValueChange={() => {}} />
    </View>
  );
}

// --- 開いた状態（ボトムシート）--- Modal が全画面を覆うため外側の padding View は不要

export function OpenNearTop() {
  useAutoOpen();
  return <DayBoundaryPicker value={4} onValueChange={() => {}} />;
}

export function OpenNearBottom() {
  useAutoOpen();
  return <DayBoundaryPicker value={22} onValueChange={() => {}} />;
}
