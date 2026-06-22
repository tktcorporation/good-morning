import SwiftUI
import WidgetKit

// MARK: - Home Screen Widget
//
// ホーム画面に「次のアラーム」または「起床ミッションの進捗」を表示するウィジェット。
// データは App Groups 経由（WidgetDataStore）で読み取る。更新は基本的にアプリ側の
// reloadWidgetTimelines() でトリガーされ、フォールバックとして1時間ごとに自動更新する。

struct GoodMorningEntry: TimelineEntry {
  let date: Date
  let data: WidgetData?
}

struct GoodMorningProvider: TimelineProvider {
  func placeholder(in context: Context) -> GoodMorningEntry {
    GoodMorningEntry(date: Date(), data: nil)
  }

  func getSnapshot(in context: Context, completion: @escaping (GoodMorningEntry) -> Void) {
    completion(GoodMorningEntry(date: Date(), data: WidgetDataStore.load()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<GoodMorningEntry>) -> Void) {
    let entry = GoodMorningEntry(date: Date(), data: WidgetDataStore.load())
    // アプリ起動・状態変更時は reloadWidgetTimelines() で即時更新されるが、
    // バックグラウンドのみで日付が変わるケースに備えて 1 時間後の自動更新も予約する。
    let nextUpdate = Date().addingTimeInterval(60 * 60)
    completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
  }
}

struct GoodMorningHomeWidgetEntryView: View {
  @Environment(\.widgetFamily) var family
  var entry: GoodMorningEntry

  var body: some View {
    content
      .widgetBackground(WidgetTheme.background)
  }

  @ViewBuilder
  private var content: some View {
    if let session = entry.data?.session, !session.todos.isEmpty {
      SessionProgressView(session: session, family: family)
    } else {
      NextAlarmView(data: entry.data, family: family)
    }
  }
}

// MARK: - 起床ミッション進捗

private struct SessionProgressView: View {
  let session: WidgetData.SessionData
  let family: WidgetFamily

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 6) {
        Image(systemName: "sun.max.fill").foregroundColor(WidgetTheme.accent)
        Text("起床ミッション")
          .font(.caption).fontWeight(.semibold)
          .foregroundColor(WidgetTheme.muted)
        Spacer()
        Text("\(session.progress.completed)/\(session.progress.total)")
          .font(.caption).fontWeight(.bold)
          .foregroundColor(.white)
      }

      ProgressView(
        value: Double(session.progress.completed),
        total: Double(max(session.progress.total, 1))
      )
      .tint(WidgetTheme.accent)

      if family == .systemMedium {
        VStack(alignment: .leading, spacing: 4) {
          ForEach(session.todos.prefix(3)) { todo in
            HStack(spacing: 6) {
              Image(systemName: todo.completed ? "checkmark.circle.fill" : "circle")
                .foregroundColor(todo.completed ? WidgetTheme.accent : WidgetTheme.muted)
                .font(.caption)
              Text(todo.title)
                .font(.caption)
                .strikethrough(todo.completed)
                .foregroundColor(todo.completed ? WidgetTheme.muted : .white)
                .lineLimit(1)
            }
          }
        }
      }

      Spacer(minLength: 0)

      if let snooze = parseISODate(session.snoozeFiresAt), snooze > Date() {
        HStack(spacing: 4) {
          Image(systemName: "alarm.fill").font(.caption2).foregroundColor(.orange)
          Text("次のアラーム")
            .font(.caption2).foregroundColor(WidgetTheme.muted)
          // .timer スタイルはライブ更新のため単独の Text にする（連結すると静的化する）。
          Text(snooze, style: .timer)
            .font(.caption2).fontWeight(.semibold).foregroundColor(.white)
            .frame(maxWidth: 56, alignment: .leading)
        }
      }
    }
    .padding(family == .systemSmall ? 12 : 16)
  }
}

// MARK: - 次のアラーム

private struct NextAlarmView: View {
  let data: WidgetData?
  let family: WidgetFamily

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(spacing: 6) {
        Image(systemName: "sun.max.fill").foregroundColor(WidgetTheme.accent)
        Text("Good Morning")
          .font(.caption).fontWeight(.semibold)
          .foregroundColor(WidgetTheme.muted)
        Spacer()
      }

      Spacer(minLength: 0)

      if let alarm = data?.nextAlarm {
        Text(alarm.time)
          .font(.system(size: family == .systemSmall ? 34 : 44, weight: .bold, design: .rounded))
          .foregroundColor(alarm.enabled ? .white : WidgetTheme.muted)
        Text(alarm.enabled ? "次のアラーム" : "アラームはオフ")
          .font(.caption2)
          .foregroundColor(WidgetTheme.muted)
      } else {
        Text("--:--")
          .font(.system(size: family == .systemSmall ? 34 : 44, weight: .bold, design: .rounded))
          .foregroundColor(WidgetTheme.muted)
        Text("アラーム未設定")
          .font(.caption2)
          .foregroundColor(WidgetTheme.muted)
      }

      Spacer(minLength: 0)

      if let streak = data?.streak, streak.currentStreak > 0 {
        HStack(spacing: 4) {
          Text("🔥")
          Text("\(streak.currentStreak)日連続")
            .font(.caption2).fontWeight(.semibold)
            .foregroundColor(.white)
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(family == .systemSmall ? 12 : 16)
  }
}

// MARK: - Widget 定義

struct GoodMorningHomeWidget: Widget {
  let kind = "GoodMorningHomeWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: GoodMorningProvider()) { entry in
      GoodMorningHomeWidgetEntryView(entry: entry)
    }
    .configurationDisplayName("Good Morning")
    .description("次のアラームと起床ミッションの進捗を表示します。")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

// MARK: - 共通ヘルパー

extension View {
  /// iOS 17 で必須になった containerBackground に対応しつつ、16.x でも背景を描画する。
  @ViewBuilder
  func widgetBackground(_ color: Color) -> some View {
    if #available(iOS 17.0, *) {
      self.containerBackground(color, for: .widget)
    } else {
      self.background(color)
    }
  }
}

/// ISO8601 文字列（小数秒付き / なし両対応）を Date に変換する。
/// JS 側は toISOString() で小数秒付きを出力するが、堅牢性のため両方試す。
func parseISODate(_ iso: String?) -> Date? {
  guard let iso, !iso.isEmpty else { return nil }
  let withFraction = ISO8601DateFormatter()
  withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  if let date = withFraction.date(from: iso) { return date }
  return ISO8601DateFormatter().date(from: iso)
}
