---
"good-morning": patch
---

ストア永続化を Effect の StorageService に統一し、データ破損時の安定性を強化

- daily-grade ストアの読み込みで grades/streak の JSON が破損しているとロード処理全体が例外を投げていた問題を修正（他ストアと同様、破損データはデフォルト値にフォールバックする）
- wake-target ストアの読み込みに読み取りリトライが無く、ストレージの一時的な読み取り失敗が未処理のまま伝播していた問題を修正
- 全5ストア（settings / wake-target / wake-record / morning-session / daily-grade）の永続化を、型付きエラー・統一されたリトライ・JSON パース保護を持つ Effect の StorageService 経由に統一（従来は個別に AsyncStorage を直接操作しており、リトライ適用や失敗処理が不統一だった）
- settings / morning-session / daily-grade（streak）はスキーマ検証を追加し、型が一致しない永続化データをデータ破損として安全にデフォルト値へフォールバックするようにした
