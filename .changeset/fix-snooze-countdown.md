---
"good-morning": patch
---

fix: ネイティブスヌーズの postAlert 自動再発火を除去して連続鳴動を修正

AlarmKit の countdownDuration(postAlert:) と secondaryButtonBehavior(.countdown) を
除去し、各スヌーズを単発アラームに変更。postAlert を設定すると発火後に自動で
再カウントダウン→再発火するため、先行スケジュール済みの次のスヌーズと同時刻に
鳴り、アラームが指数的に増殖していた。
