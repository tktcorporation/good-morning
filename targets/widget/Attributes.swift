import ActivityKit
import Foundation

// MARK: - Live Activity Attributes
//
// 起床フローの Live Activity（ロック画面 + Dynamic Island）の属性定義。
//
// 重要: この型は「Live Activity を request する側（expo-alarm-kit の
// ExpoAlarmKitModule.swift）」と「Live Activity を描画する側（この Widget
// Extension）」の双方で参照される。ActivityKit は request 時の Attributes 型と
// ActivityConfiguration(for:) の型を結び付けるため、両者で型名・プロパティ構成を
// 完全に一致させること。expo-alarm-kit はパッチ（patches/expo-alarm-kit@0.1.6.patch）
// 内に同一定義を持つ。片方だけ変更すると Live Activity が描画されなくなる。
//
// 本体と Widget Extension は別モジュールのため、同一ソースの共有ではなく
// 同一定義の二重管理になっている。変更時は必ず両方を同時に更新する。

struct GoodMorningWakeAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    /// 起床タスクの一覧（完了状態を含む）。
    public var todos: [LiveTodo]
    /// 次のスヌーズが鳴る時刻（Unix エポック秒）。スヌーズ待機中でなければ nil。
    public var snoozeEpoch: Double?

    public init(todos: [LiveTodo], snoozeEpoch: Double?) {
      self.todos = todos
      self.snoozeEpoch = snoozeEpoch
    }
  }

  public init() {}
}

/// Live Activity 内で表示する単一の起床タスク。
struct LiveTodo: Codable, Hashable, Identifiable {
  public var id: String
  public var title: String
  public var completed: Bool

  public init(id: String, title: String, completed: Bool) {
    self.id = id
    self.title = title
    self.completed = completed
  }
}
