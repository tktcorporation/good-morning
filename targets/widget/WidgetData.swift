import Foundation

// MARK: - Widget Data
//
// ホームウィジェットに表示するデータ。メインアプリの buildWidgetData()
// (src/domain/widget-data.ts) が組み立てた JSON を App Groups UserDefaults の
// "widget-data" キーから読み取る。
//
// 重要: プロパティ構成は src/types/widget-data.ts の WidgetData と完全に一致させること。
// 片方だけ変更すると JSON デコードに失敗してウィジェットが空表示になる。

struct WidgetData: Codable {
  let nextAlarm: NextAlarm?
  let session: SessionData?
  let streak: Streak
  let updatedAt: String

  struct NextAlarm: Codable {
    let time: String  // "HH:mm"
    let enabled: Bool
    let label: String  // 曜日ラベル（例: "月"）
  }

  struct WidgetTodo: Codable, Identifiable {
    let id: String
    let title: String
    let completed: Bool
  }

  struct Progress: Codable {
    let completed: Int
    let total: Int
  }

  struct SessionData: Codable {
    let todos: [WidgetTodo]
    let snoozeFiresAt: String?
    let progress: Progress
  }

  struct Streak: Codable {
    let currentStreak: Int
    let lastGrade: String
  }
}

/// App Groups 経由で WidgetData を読み取るストア。
///
/// App Group ID は AlarmKitService.ts / expo-target.config.js と同じ値を使用する。
/// 変更時は 3 箇所すべてを揃えること。
enum WidgetDataStore {
  static let appGroupId = "group.com.tktcorporation.goodmorning"
  static let storageKey = "widget-data"

  static func load() -> WidgetData? {
    guard let defaults = UserDefaults(suiteName: appGroupId),
      let json = defaults.string(forKey: storageKey),
      let data = json.data(using: .utf8)
    else {
      return nil
    }
    return try? JSONDecoder().decode(WidgetData.self, from: data)
  }
}
