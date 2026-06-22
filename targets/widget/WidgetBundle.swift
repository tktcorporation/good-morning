import SwiftUI
import WidgetKit

// MARK: - Widget Bundle（エントリポイント）
//
// Widget Extension が提供するウィジェットをまとめる @main。
// ホーム画面ウィジェットと Live Activity を登録する。
// Live Activity は iOS 16.2+ のため可用性で分岐する。

@main
struct GoodMorningWidgetBundle: WidgetBundle {
  var body: some Widget {
    GoodMorningHomeWidget()
    if #available(iOS 16.2, *) {
      GoodMorningLiveActivity()
    }
  }
}
