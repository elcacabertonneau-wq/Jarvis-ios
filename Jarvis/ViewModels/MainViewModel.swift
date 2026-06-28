import Foundation
import SwiftUI
import Combine

@MainActor
final class MainViewModel: ObservableObject {
    @Published var showChat: Bool = false
    @Published var showSettings: Bool = false
    @Published var showHistory: Bool = false
    @Published var showCamera: Bool = false
    @Published var showNotes: Bool = false
    @Published var currentTime: String = ""
    @Published var currentDate: String = ""
    @Published var systemStatus: [SystemStatusItem] = []

    private var timer: Timer?
    private var cancellables = Set<AnyCancellable>()

    init() {
        startClock()
        buildSystemStatus()
    }

    private func startClock() {
        updateTime()
        timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.updateTime()
            }
        }
    }

    private func updateTime() {
        currentTime = Date().formattedForHUD
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE d MMMM yyyy"
        formatter.locale = Locale(identifier: "fr_FR")
        currentDate = formatter.string(from: Date()).uppercased()
    }

    private func buildSystemStatus() {
        systemStatus = [
            SystemStatusItem(label: "RÉSEAU", value: NetworkService.shared.connectionType.displayName, isOnline: NetworkService.shared.isConnected),
            SystemStatusItem(label: "MICRO", value: PermissionsManager.shared.status.microphone ? "ACTIF" : "INACTIF", isOnline: PermissionsManager.shared.status.microphone),
            SystemStatusItem(label: "IA", value: SettingsManager.shared.selectedProvider.rawValue.uppercased(), isOnline: SettingsManager.shared.selectedProvider.hasAPIKey),
            SystemStatusItem(label: "JARVIS", value: "v1.0", isOnline: true)
        ]

        NetworkService.shared.$isConnected
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.buildSystemStatus() }
            .store(in: &cancellables)
    }

    func handleMicTap() {
        let jarvis = JarvisManager.shared
        if jarvis.state == .listening {
            jarvis.stopListening()
        } else {
            jarvis.startListening()
        }
    }

    deinit {
        timer?.invalidate()
    }
}

struct SystemStatusItem: Identifiable {
    let id = UUID()
    let label: String
    let value: String
    let isOnline: Bool
}
