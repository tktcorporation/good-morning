---
"good-morning": patch
---

Schema検証の一括デコードにより永続化データの正常なフィールドが巻き添えで失われる問題を修正

- settings / daily-grade（streak）/ wake-record / morning-session の永続化データデコードを、
  Schema.Struct による一括デコードからフィールド単位のデコードに変更。従来は1フィールドの
  型不一致だけでオブジェクト全体のデコードが失敗し、他の正常なフィールド（AlarmKit権限許可
  状態・ストリーク実績・起床履歴・進行中セッションのスヌーズ状態等）までデフォルト値に
  巻き添えで上書きされていた
- wake-record の永続化スキーマが必須フィールドを厳格に要求していたため、後から追加された
  フィールドを持たない過去データが要素ごと静かに破棄されうる問題を修正（id/date/result以外は
  フィールド単位でデフォルト補完するよう変更）
- morning-session の読み込みで、破損した startedAt から windowEnd を計算する際に
  RangeError が発生すると StorageDecodeError の捕捉から漏れ、データ破損時と異なる
  エラー経路（ロード状態が復旧不能になる）を辿っていた問題を修正
- daily-grade の grades 配列読み込みが要素単位の形状検証をしていなかった問題を修正
  （wake-record と同じレコード単位検証パターンに統一）
