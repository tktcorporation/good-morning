import ActivityKit
import SwiftUI
import WidgetKit

// MARK: - Live Activity
//
// 起床フロー中、ロック画面と Dynamic Island に「起床ミッションの進捗」と
// 「次のスヌーズまでのカウントダウン」を表示する Live Activity。
//
// 開始/更新/終了は expo-alarm-kit の startLiveActivity/updateLiveActivity/endLiveActivity
// （ExpoAlarmKitModule.swift）が ActivityKit 経由で行う。表示する型 GoodMorningWakeAttributes
// は Attributes.swift と expo-alarm-kit パッチで完全一致させること。

/// ContentState の todos から完了数・総数を求める。
func todoProgress(_ todos: [LiveTodo]) -> (completed: Int, total: Int) {
  (todos.filter { $0.completed }.count, todos.count)
}

@available(iOS 16.2, *)
struct GoodMorningLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: GoodMorningWakeAttributes.self) { context in
      LiveActivityLockScreenView(state: context.state)
        .activityBackgroundTint(WidgetTheme.background.opacity(0.95))
        .activitySystemActionForegroundColor(.white)
    } dynamicIsland: { context in
      let progress = todoProgress(context.state.todos)
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Label("起床", systemImage: "sun.max.fill")
            .foregroundColor(WidgetTheme.accent)
            .font(.caption)
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text("\(progress.completed)/\(progress.total)")
            .fontWeight(.bold)
            .foregroundColor(.white)
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 4) {
            if let next = context.state.todos.first(where: { !$0.completed }) {
              Text(next.title)
                .font(.caption)
                .foregroundColor(.white)
                .lineLimit(1)
            } else {
              Text("すべて完了！")
                .font(.caption)
                .foregroundColor(WidgetTheme.accent)
            }
            SnoozeCountdown(snoozeEpoch: context.state.snoozeEpoch)
          }
        }
      } compactLeading: {
        Image(systemName: "sun.max.fill").foregroundColor(WidgetTheme.accent)
      } compactTrailing: {
        Text("\(progress.completed)/\(progress.total)")
          .foregroundColor(.white)
      } minimal: {
        Image(systemName: "sun.max.fill").foregroundColor(WidgetTheme.accent)
      }
    }
  }
}

// MARK: - ロック画面 / バナー

@available(iOS 16.2, *)
struct LiveActivityLockScreenView: View {
  let state: GoodMorningWakeAttributes.ContentState

  var body: some View {
    let progress = todoProgress(state.todos)
    VStack(alignment: .leading, spacing: 8) {
      HStack {
        Image(systemName: "sun.max.fill").foregroundColor(WidgetTheme.accent)
        Text("起床ミッション")
          .font(.subheadline).fontWeight(.semibold)
          .foregroundColor(.white)
        Spacer()
        Text("\(progress.completed)/\(progress.total)")
          .font(.subheadline).fontWeight(.bold)
          .foregroundColor(.white)
      }

      ProgressView(
        value: Double(progress.completed),
        total: Double(max(progress.total, 1))
      )
      .tint(WidgetTheme.accent)

      ForEach(state.todos.prefix(3)) { todo in
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

      SnoozeCountdown(snoozeEpoch: state.snoozeEpoch)
    }
    .padding()
  }
}

// MARK: - スヌーズカウントダウン

/// 次のスヌーズが鳴る時刻までのカウントダウン。未来の時刻が無ければ何も描画しない。
@available(iOS 16.2, *)
struct SnoozeCountdown: View {
  let snoozeEpoch: Double?

  var body: some View {
    if let epoch = snoozeEpoch {
      let fireDate = Date(timeIntervalSince1970: epoch)
      if fireDate > Date() {
        HStack(spacing: 4) {
          Image(systemName: "alarm.fill")
            .font(.caption2).foregroundColor(.orange)
          Text("次のアラーム")
            .font(.caption2).foregroundColor(WidgetTheme.muted)
          Text(fireDate, style: .timer)
            .font(.caption2).fontWeight(.semibold)
            .foregroundColor(.white)
            .frame(maxWidth: 56, alignment: .leading)
        }
      }
    }
  }
}
