import Vision
import UIKit
import CoreImage

final class VisionService {
    static let shared = VisionService()
    private init() {}

    func recognizeText(in image: UIImage) async throws -> String {
        guard let cgImage = image.cgImage else {
            throw VisionError.invalidImage
        }

        return try await withCheckedThrowingContinuation { continuation in
            let request = VNRecognizeTextRequest { request, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                let observations = request.results as? [VNRecognizedTextObservation] ?? []
                let text = observations
                    .compactMap { $0.topCandidates(1).first?.string }
                    .joined(separator: "\n")
                continuation.resume(returning: text.isEmpty ? "Aucun texte détecté" : text)
            }

            request.recognitionLevel = .accurate
            request.recognitionLanguages = ["fr-FR", "en-US"]
            request.usesLanguageCorrection = true

            let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
            do {
                try handler.perform([request])
            } catch {
                continuation.resume(throwing: error)
            }
        }
    }

    func detectObjects(in image: UIImage) async throws -> [String] {
        guard let cgImage = image.cgImage else {
            throw VisionError.invalidImage
        }

        return try await withCheckedThrowingContinuation { continuation in
            let request = VNRecognizeAnimalsRequest { request, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                let observations = request.results as? [VNRecognizedObjectObservation] ?? []
                let labels = observations.compactMap { obs -> String? in
                    obs.labels.first.map { "\($0.identifier) (\(Int($0.confidence * 100))%)" }
                }
                continuation.resume(returning: labels)
            }

            let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
            do {
                try handler.perform([request])
            } catch {
                continuation.resume(throwing: error)
            }
        }
    }

    func classifyScene(in image: UIImage) async throws -> [VNClassificationObservation] {
        guard let cgImage = image.cgImage else {
            throw VisionError.invalidImage
        }

        return try await withCheckedThrowingContinuation { continuation in
            let request = VNClassifyImageRequest { request, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                let results = (request.results as? [VNClassificationObservation] ?? [])
                    .filter { $0.confidence > 0.3 }
                    .sorted { $0.confidence > $1.confidence }
                    .prefix(10)
                continuation.resume(returning: Array(results))
            }

            let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
            do {
                try handler.perform([request])
            } catch {
                continuation.resume(throwing: error)
            }
        }
    }

    func detectFaces(in image: UIImage) async throws -> Int {
        guard let cgImage = image.cgImage else {
            throw VisionError.invalidImage
        }

        return try await withCheckedThrowingContinuation { continuation in
            let request = VNDetectFaceRectanglesRequest { request, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                let count = (request.results as? [VNFaceObservation])?.count ?? 0
                continuation.resume(returning: count)
            }

            let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
            do {
                try handler.perform([request])
            } catch {
                continuation.resume(throwing: error)
            }
        }
    }

    func generateImageDescription(for image: UIImage) async -> String {
        var descriptions: [String] = []

        if let classifications = try? await classifyScene(in: image) {
            let scenes = classifications.prefix(5).map { $0.identifier }.joined(separator: ", ")
            descriptions.append("Scène: \(scenes)")
        }

        if let faceCount = try? await detectFaces(in: image) {
            if faceCount > 0 {
                descriptions.append("\(faceCount) visage(s) détecté(s)")
            }
        }

        if let text = try? await recognizeText(in: image), text != "Aucun texte détecté" {
            descriptions.append("Texte visible: \(text.truncated(to: 100))")
        }

        return descriptions.isEmpty ? "Image analysée" : descriptions.joined(separator: ". ")
    }
}

enum VisionError: LocalizedError {
    case invalidImage
    case analysisFailure(String)

    var errorDescription: String? {
        switch self {
        case .invalidImage: return "Image invalide"
        case .analysisFailure(let msg): return "Analyse échouée: \(msg)"
        }
    }
}
