import AVFoundation
import UIKit
import Combine

enum CameraError: LocalizedError {
    case notAuthorized
    case configurationFailed
    case captureFailure

    var errorDescription: String? {
        switch self {
        case .notAuthorized: return "Accès à la caméra non autorisé"
        case .configurationFailed: return "Configuration caméra échouée"
        case .captureFailure: return "Capture d'image échouée"
        }
    }
}

final class CameraService: NSObject, ObservableObject {
    static let shared = CameraService()

    @Published var capturedImage: UIImage?
    @Published var isSessionRunning = false
    @Published var error: CameraError?

    let session = AVCaptureSession()
    private let photoOutput = AVCapturePhotoOutput()
    private var captureCompletion: ((UIImage?) -> Void)?

    private override init() {
        super.init()
    }

    func requestPermission() async -> Bool {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: return true
        case .notDetermined:
            return await AVCaptureDevice.requestAccess(for: .video)
        default: return false
        }
    }

    func configureSession() throws {
        session.beginConfiguration()
        session.sessionPreset = .photo

        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
              let input = try? AVCaptureDeviceInput(device: device),
              session.canAddInput(input)
        else {
            session.commitConfiguration()
            throw CameraError.configurationFailed
        }

        session.addInput(input)

        if session.canAddOutput(photoOutput) {
            session.addOutput(photoOutput)
        }

        session.commitConfiguration()
    }

    func startSession() {
        guard !session.isRunning else { return }
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.session.startRunning()
            DispatchQueue.main.async {
                self?.isSessionRunning = self?.session.isRunning ?? false
            }
        }
    }

    func stopSession() {
        guard session.isRunning else { return }
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.session.stopRunning()
            DispatchQueue.main.async {
                self?.isSessionRunning = false
            }
        }
    }

    func capturePhoto(completion: @escaping (UIImage?) -> Void) {
        captureCompletion = completion
        let settings = AVCapturePhotoSettings()
        settings.flashMode = .auto
        photoOutput.capturePhoto(with: settings, delegate: self)
    }
}

extension CameraService: AVCapturePhotoCaptureDelegate {
    func photoOutput(
        _ output: AVCapturePhotoOutput,
        didFinishProcessingPhoto photo: AVCapturePhoto,
        error: Error?
    ) {
        guard error == nil,
              let data = photo.fileDataRepresentation(),
              let image = UIImage(data: data)
        else {
            captureCompletion?(nil)
            return
        }

        DispatchQueue.main.async { [weak self] in
            self?.capturedImage = image
            self?.captureCompletion?(image)
            self?.captureCompletion = nil
        }
    }
}
