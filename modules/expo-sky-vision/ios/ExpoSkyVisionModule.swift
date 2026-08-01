import ExpoModulesCore
import Vision
import UIKit

/// UIImage.cgImage は撮影時のセンサー向きのままの生ピクセルデータで、実際の
/// 上下は別プロパティ imageOrientation（EXIF由来の回転フラグ）が持つ。
/// VNImageRequestHandler に orientation を渡さないとデフォルトの .up 前提で
/// 解析され、縦向き撮影（空にカメラを向ける際の自然な向き）が横倒しのまま
/// 分類されて信頼度が下がってしまうため、明示的に変換して渡す。
extension CGImagePropertyOrientation {
  init(_ uiOrientation: UIImage.Orientation) {
    switch uiOrientation {
    case .up: self = .up
    case .upMirrored: self = .upMirrored
    case .down: self = .down
    case .downMirrored: self = .downMirrored
    case .left: self = .left
    case .leftMirrored: self = .leftMirrored
    case .right: self = .right
    case .rightMirrored: self = .rightMirrored
    @unknown default: self = .up
    }
  }
}

/// カメラで撮影した写真を Vision framework の組み込みシーン分類器
/// (VNClassifyImageRequest) に渡し、分類結果をそのまま返すだけの薄いラッパー。
/// 「空かどうか」の判定（キーワード・閾値）は JS 側（src/utils/sky-classification.ts）が
/// 担う。分類語彙やモデルは OS が提供するため学習・同梱データは不要。
public class ExpoSkyVisionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoSkyVision")

    AsyncFunction("classifyImageAsync") { (imageUri: String, minConfidence: Double?) -> [[String: Any]] in
      guard let url = URL(string: imageUri) else {
        throw NSError(
          domain: "ExpoSkyVision", code: 1,
          userInfo: [NSLocalizedDescriptionKey: "Invalid image URI: \(imageUri)"])
      }
      // 呼び出し元(SkyChallengeItem)は撮影のたびに新しいキャッシュファイルを作り、
      // 分類後も自分では消さない。ここで読み込み後に削除し、判定の成否に関わらず
      // キャッシュが撮影のたびに蓄積するのを防ぐ。
      defer {
        if url.isFileURL {
          try? FileManager.default.removeItem(at: url)
        }
      }
      guard let data = try? Data(contentsOf: url), let uiImage = UIImage(data: data),
        let cgImage = uiImage.cgImage
      else {
        throw NSError(
          domain: "ExpoSkyVision", code: 2,
          userInfo: [NSLocalizedDescriptionKey: "Failed to load image at: \(imageUri)"])
      }

      let orientation = CGImagePropertyOrientation(uiImage.imageOrientation)
      let request = VNClassifyImageRequest()
      let handler = VNImageRequestHandler(cgImage: cgImage, orientation: orientation, options: [:])
      try handler.perform([request])

      // results の並び順(信頼度順かどうか)は保証されないため件数で打ち切らない。
      // 代わりに minConfidence 未満を信頼度で除外する(位置ではなく値による
      // フィルタなので、閾値以上のラベルを取りこぼすことはない)。
      // Vision の分類語彙は約1300件あり、フィルタ無しだと撮影のたびに
      // 全件がブリッジを渡ることになる。
      let threshold = minConfidence ?? -Double.greatestFiniteMagnitude
      let observations = (request.results ?? []).filter { Double($0.confidence) >= threshold }
      return observations.map { observation in
        ["identifier": observation.identifier, "confidence": observation.confidence]
      }
    }
  }
}
