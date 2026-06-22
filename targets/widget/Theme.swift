import SwiftUI

// MARK: - Widget / Live Activity 共通テーマ
//
// ホームウィジェットと Live Activity で配色を揃えるための定数。
// アプリ本体のダークテーマ（splash backgroundColor #1a1a2e）に合わせている。

enum WidgetTheme {
  static let background = Color(red: 0.102, green: 0.102, blue: 0.180)
  static let accent = Color(red: 0.40, green: 0.56, blue: 1.0)
  static let muted = Color.white.opacity(0.6)
}
