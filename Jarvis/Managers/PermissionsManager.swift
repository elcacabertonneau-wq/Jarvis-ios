import Foundation
import Speech
import AVFoundation
import EventKit
import CoreLocation
import UserNotifications
import Photos
import Combine

struct PermissionsStatus {
    var microphone: Bool = false
    var speech: Bool = false
    var camera: Bool = false
    var calendar: Bool = false
    var reminders: Bool = false
    var notifications: Bool = false
    var location: Bool = false
    var photos: Bool = false
}

final class PermissionsManager: ObservableObject {
    static let shared = PermissionsManager()
    @Published var status = PermissionsStatus()
    private init() { Task { await checkAll() } }

    func requestAll() async {
        await requestMicrophone()
        await requestSpeech()
        await requestCamera()
        await requestNotifications()
        await requestLocation()
    }

    @discardableResult
    func requestMicrophone() async -> Bool {
        return await withCheckedContinuation { continuation in
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                DispatchQueue.main.async {
                    self.status.microphone = granted
                }
                continuation.resume(returning: granted)
            }
        }
    }

    @discardableResult
    func requestSpeech() async -> Bool {
        return await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                let granted = status == .authorized
                DispatchQueue.main.async {
                    self.status.speech = granted
                }
                continuation.resume(returning: granted)
            }
        }
    }

    @discardableResult
    func requestCamera() async -> Bool {
        let granted = await AVCaptureDevice.requestAccess(for: .video)
        await MainActor.run { status.camera = granted }
        return granted
    }

    @discardableResult
    func requestNotifications() async -> Bool {
        do {
            let granted = try await UNUserNotificationCenter.current()
                .requestAuthorization(options: [.alert, .sound, .badge])
            await MainActor.run { status.notifications = granted }
            return granted
        } catch { return false }
    }

    @discardableResult
    func requestLocation() async -> Bool {
        let manager = CLLocationManager()
        manager.requestWhenInUseAuthorization()
        let granted = manager.authorizationStatus == .authorizedWhenInUse ||
                      manager.authorizationStatus == .authorizedAlways
        await MainActor.run { status.location = granted }
        return granted
    }

    func checkAll() async {
        let micStatus = AVAudioSession.sharedInstance().recordPermission == .granted
        let speechStatus = SFSpeechRecognizer.authorizationStatus() == .authorized
        let camStatus = AVCaptureDevice.authorizationStatus(for: .video) == .authorized
        let locStatus = CLLocationManager().authorizationStatus == .authorizedWhenInUse ||
                        CLLocationManager().authorizationStatus == .authorizedAlways

        let notifStatus = await withCheckedContinuation { (cont: CheckedContinuation<Bool, Never>) in
            UNUserNotificationCenter.current().getNotificationSettings { settings in
                cont.resume(returning: settings.authorizationStatus == .authorized)
            }
        }

        await MainActor.run {
            status.microphone = micStatus
            status.speech = speechStatus
            status.camera = camStatus
            status.location = locStatus
            status.notifications = notifStatus
        }
    }

    var essentialPermissionsGranted: Bool {
        status.microphone && status.speech
    }
}
