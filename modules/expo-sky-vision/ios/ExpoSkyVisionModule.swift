import ExpoModulesCore
import Vision
import UIKit

/// カメラで撮影した写真を Vision framework の組み込みシーン分類器
/// (VNClassifyImageRequest) に渡し、分類結果をそのまま返すだけの薄いラッパー。
/// 「空かどうか」の判定（キーワード・閾値）は JS 側（src/utils/sky-classification.ts）が
/// 担う。分類語彙やモデルは OS が提供するため学習・同梱データは不要。
public class ExpoSkyVisionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoSkyVision")

    AsyncFunction("classifyImageAsync") { (imageUri: String) -> [[String: Any]] in
      guard let url = URL(string: imageUri) else {
        throw NSError(
          domain: "ExpoSkyVision", code: 1,
          userInfo: [NSLocalizedDescriptionKey: "Invalid image URI: \(imageUri)"])
      }
      guard let data = try? Data(contentsOf: url), let cgImage = UIImage(data: data)?.cgImage else {
        throw NSError(
          domain: "ExpoSkyVision", code: 2,
          userInfo: [NSLocalizedDescriptionKey: "Failed to load image at: \(imageUri)"])
      }

      let request = VNClassifyImageRequest()
      let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
      try handler.perform([request])

      let observations = request.results ?? []
      return observations.prefix(30).map { observation in
        ["identifier": observation.identifier, "confidence": observation.confidence]
      }
    }
  }
}
