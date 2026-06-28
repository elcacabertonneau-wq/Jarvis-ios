import SwiftUI
import AVFoundation

struct CameraView: View {
    @StateObject private var cameraService = CameraService.shared
    @EnvironmentObject var jarvisManager: JarvisManager
    @Environment(\.dismiss) var dismiss
    @State private var capturedImage: UIImage? = nil
    @State private var analysisResult: String = ""
    @State private var isAnalyzing: Bool = false
    @State private var showResult: Bool = false
    @State private var scanMode: ScanMode = .describe
    @State private var hasSetup = false

    enum ScanMode: String, CaseIterable {
        case describe = "Décrire"
        case readText = "Lire Texte"
        case identify = "Identifier"
        case analyze = "Analyser"

        var icon: String {
            switch self {
            case .describe: return "eye"
            case .readText: return "doc.text.viewfinder"
            case .identify: return "viewfinder.circle"
            case .analyze: return "brain"
            }
        }

        var prompt: String {
            switch self {
            case .describe: return "Décris en détail ce que tu vois sur cette image."
            case .readText: return "Lis et retranscris tout le texte visible sur cette image."
            case .identify: return "Identifie les objets, personnes et éléments principaux de cette image."
            case .analyze: return "Analyse cette image en profondeur : contexte, contenu, émotions, informations notables."
            }
        }
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if !hasSetup {
                setupView
            } else {
                mainContent
            }
        }
        .preferredColorScheme(.dark)
    }

    private var setupView: some View {
        VStack(spacing: 20) {
            Spacer()
            Image(systemName: "camera.viewfinder")
                .font(.system(size: 60, weight: .ultraLight))
                .foregroundColor(AppConstants.Colors.primaryCyan)
                .neonGlow(color: AppConstants.Colors.primaryCyan, radius: 20)

            Text("VISION JARVIS")
                .font(AppConstants.Fonts.hudTitle)
                .foregroundColor(AppConstants.Colors.primaryCyan)
                .tracking(6)

            Button("Activer la caméra") {
                Task { await setupCamera() }
            }
            .font(AppConstants.Fonts.hudBody)
            .foregroundColor(AppConstants.Colors.darkBackground)
            .padding(.horizontal, 30)
            .padding(.vertical, 12)
            .background(AppConstants.Colors.primaryCyan)
            .clipShape(Capsule())

            Button("Fermer") { dismiss() }
                .font(AppConstants.Fonts.hudSmall)
                .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.7))
            Spacer()
        }
    }

    private var mainContent: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Button(action: { dismiss() }) {
                    Image(systemName: "xmark")
                        .font(.system(size: 16, weight: .light))
                        .foregroundColor(.white)
                        .padding(8)
                        .background(Circle().fill(Color.black.opacity(0.4)))
                }
                Spacer()
                Text("VISION IA")
                    .font(AppConstants.Fonts.hudSubtitle)
                    .foregroundColor(AppConstants.Colors.primaryCyan)
                    .tracking(4)
                Spacer()
                Image(systemName: "bolt.fill")
                    .font(.system(size: 16))
                    .foregroundColor(AppConstants.Colors.primaryCyan)
                    .opacity(0)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)

            // Camera or captured image
            ZStack {
                if let captured = capturedImage {
                    Image(uiImage: captured)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(maxWidth: .infinity, maxHeight: 400)
                        .clipped()
                } else {
                    CameraPreviewView(session: cameraService.session)
                        .frame(maxWidth: .infinity, maxHeight: 400)
                }

                // Scanner overlay
                ScannerRingView(color: AppConstants.Colors.primaryCyan, size: 250)
                    .opacity(capturedImage == nil ? 0.6 : 0)

                // Corner brackets
                ScanFrameOverlay()
                    .opacity(capturedImage == nil ? 1 : 0)

                // Analyzing overlay
                if isAnalyzing {
                    Color.black.opacity(0.6)
                    VStack(spacing: 12) {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: AppConstants.Colors.primaryCyan))
                            .scaleEffect(1.5)
                        Text("ANALYSE EN COURS...")
                            .font(AppConstants.Fonts.hudBody)
                            .foregroundColor(AppConstants.Colors.primaryCyan)
                            .tracking(3)
                    }
                }
            }

            // Mode selector
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(ScanMode.allCases, id: \.rawValue) { mode in
                        Button(action: { scanMode = mode }) {
                            HStack(spacing: 4) {
                                Image(systemName: mode.icon)
                                    .font(.system(size: 11, weight: .light))
                                Text(mode.rawValue)
                                    .font(.system(size: 11, weight: .light, design: .monospaced))
                            }
                            .foregroundColor(scanMode == mode ? AppConstants.Colors.darkBackground : AppConstants.Colors.primaryCyan)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(
                                Capsule().fill(scanMode == mode ? AppConstants.Colors.primaryCyan : AppConstants.Colors.primaryCyan.opacity(0.1))
                            )
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
            }

            // Result
            if showResult && !analysisResult.isEmpty {
                ScrollView {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Image(systemName: "brain")
                                .foregroundColor(AppConstants.Colors.primaryCyan)
                            Text("ANALYSE JARVIS")
                                .font(AppConstants.Fonts.hudSmall)
                                .foregroundColor(AppConstants.Colors.primaryCyan)
                                .tracking(3)
                            Spacer()
                            Button(action: {
                                SpeechSynthesisService.shared.speakJarvisResponse(analysisResult)
                            }) {
                                Image(systemName: "speaker.wave.2")
                                    .foregroundColor(AppConstants.Colors.primaryCyan)
                                    .font(.system(size: 14))
                            }
                        }
                        Text(analysisResult)
                            .font(.system(size: 13, weight: .light))
                            .foregroundColor(.white.opacity(0.9))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(16)
                }
                .glassmorphic(cornerRadius: 16)
                .frame(maxHeight: 180)
                .padding(.horizontal, 16)
            }

            Spacer()

            // Camera controls
            HStack(spacing: 40) {
                if capturedImage != nil {
                    Button(action: resetCapture) {
                        VStack(spacing: 4) {
                            Image(systemName: "arrow.counterclockwise")
                                .font(.system(size: 22, weight: .light))
                                .foregroundColor(.white)
                            Text("REPRENDRE")
                                .font(.system(size: 9, weight: .light, design: .monospaced))
                                .foregroundColor(.white.opacity(0.6))
                        }
                    }

                    Button(action: analyzeCapture) {
                        VStack(spacing: 4) {
                            Image(systemName: "brain.head.profile")
                                .font(.system(size: 22, weight: .light))
                                .foregroundColor(AppConstants.Colors.primaryCyan)
                                .neonGlow(color: AppConstants.Colors.primaryCyan, radius: 8)
                            Text("ANALYSER")
                                .font(.system(size: 9, weight: .light, design: .monospaced))
                                .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.8))
                        }
                    }
                } else {
                    Button(action: capturePhoto) {
                        ZStack {
                            Circle()
                                .fill(.white)
                                .frame(width: 70, height: 70)
                            Circle()
                                .stroke(AppConstants.Colors.primaryCyan, lineWidth: 3)
                                .frame(width: 80, height: 80)
                        }
                        .neonGlow(color: AppConstants.Colors.primaryCyan, radius: 10)
                    }
                }
            }
            .padding(.bottom, 40)
        }
    }

    private func setupCamera() async {
        let granted = await cameraService.requestPermission()
        guard granted else { return }
        try? cameraService.configureSession()
        cameraService.startSession()
        hasSetup = true
    }

    private func capturePhoto() {
        HapticManager.shared.impact(.medium)
        cameraService.capturePhoto { image in
            guard let image else { return }
            withAnimation {
                capturedImage = image
                showResult = false
            }
        }
    }

    private func analyzeCapture() {
        guard let image = capturedImage,
              let imageData = image.jpegData(compressionQuality: 0.8)
        else { return }

        isAnalyzing = true
        showResult = false

        Task {
            if scanMode == .readText {
                // Use on-device Vision first
                let text = (try? await VisionService.shared.recognizeText(in: image)) ?? ""
                if text.isNotEmpty && text != "Aucun texte détecté" {
                    await MainActor.run {
                        analysisResult = text
                        isAnalyzing = false
                        showResult = true
                    }
                    SpeechSynthesisService.shared.speakJarvisResponse(text)
                    return
                }
            }

            let result = await jarvisManager.analyzeImageWithAI(imageData, prompt: scanMode.prompt)
            await MainActor.run {
                analysisResult = result
                isAnalyzing = false
                showResult = true
            }
            SpeechSynthesisService.shared.speakJarvisResponse(result)
        }
    }

    private func resetCapture() {
        withAnimation {
            capturedImage = nil
            analysisResult = ""
            showResult = false
        }
    }
}

struct CameraPreviewView: UIViewRepresentable {
    let session: AVCaptureSession

    func makeUIView(context: Context) -> UIView {
        let view = UIView(frame: .zero)
        view.backgroundColor = .black
        let layer = AVCaptureVideoPreviewLayer(session: session)
        layer.videoGravity = .resizeAspectFill
        layer.frame = view.bounds
        view.layer.addSublayer(layer)
        context.coordinator.previewLayer = layer
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        context.coordinator.previewLayer?.frame = uiView.bounds
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    class Coordinator: NSObject {
        var previewLayer: AVCaptureVideoPreviewLayer?
    }
}

struct ScanFrameOverlay: View {
    var body: some View {
        GeometryReader { geo in
            ZStack {
                let w = geo.size.width * 0.7
                let h = geo.size.height * 0.7
                let x = (geo.size.width - w) / 2
                let y = (geo.size.height - h) / 2
                let len: CGFloat = 20
                let color = AppConstants.Colors.primaryCyan

                // Top-left
                Path { p in
                    p.move(to: CGPoint(x: x, y: y + len))
                    p.addLine(to: CGPoint(x: x, y: y))
                    p.addLine(to: CGPoint(x: x + len, y: y))
                }.stroke(color, lineWidth: 2)

                // Top-right
                Path { p in
                    p.move(to: CGPoint(x: x + w - len, y: y))
                    p.addLine(to: CGPoint(x: x + w, y: y))
                    p.addLine(to: CGPoint(x: x + w, y: y + len))
                }.stroke(color, lineWidth: 2)

                // Bottom-left
                Path { p in
                    p.move(to: CGPoint(x: x, y: y + h - len))
                    p.addLine(to: CGPoint(x: x, y: y + h))
                    p.addLine(to: CGPoint(x: x + len, y: y + h))
                }.stroke(color, lineWidth: 2)

                // Bottom-right
                Path { p in
                    p.move(to: CGPoint(x: x + w - len, y: y + h))
                    p.addLine(to: CGPoint(x: x + w, y: y + h))
                    p.addLine(to: CGPoint(x: x + w, y: y + h - len))
                }.stroke(color, lineWidth: 2)
            }
        }
    }
}
