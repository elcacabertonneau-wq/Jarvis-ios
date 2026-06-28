import Foundation
import EventKit
import UserNotifications

final class ReminderService {
    static let shared = ReminderService()
    private let eventStore = EKEventStore()
    private init() {}

    func requestPermission() async -> Bool {
        do {
            if #available(iOS 17.0, *) {
                return try await eventStore.requestFullAccessToReminders()
            } else {
                return try await eventStore.requestAccess(to: .reminder)
            }
        } catch { return false }
    }

    func requestNotificationPermission() async -> Bool {
        do {
            return try await UNUserNotificationCenter.current()
                .requestAuthorization(options: [.alert, .sound, .badge])
        } catch { return false }
    }

    func createReminder(title: String, dueDate: Date? = nil, notes: String? = nil) async throws -> Bool {
        let authorized = await requestPermission()
        guard authorized else { throw ReminderError.notAuthorized }

        let reminder = EKReminder(eventStore: eventStore)
        reminder.title = title
        reminder.notes = notes
        reminder.calendar = eventStore.defaultCalendarForNewReminders()

        if let date = dueDate {
            let components = Calendar.current.dateComponents(
                [.year, .month, .day, .hour, .minute],
                from: date
            )
            reminder.dueDateComponents = components

            let alarm = EKAlarm(absoluteDate: date)
            reminder.addAlarm(alarm)
        }

        try eventStore.save(reminder, commit: true)

        if let date = dueDate {
            await scheduleLocalNotification(title: title, date: date, notes: notes)
        }

        return true
    }

    func scheduleLocalNotification(title: String, date: Date, notes: String? = nil) async {
        _ = await requestNotificationPermission()

        let content = UNMutableNotificationContent()
        content.title = "JARVIS - Rappel"
        content.body = title
        if let notes { content.subtitle = notes }
        content.sound = .default

        let components = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: date)
        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
        let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: trigger)

        try? await UNUserNotificationCenter.current().add(request)
    }

    func parseReminderFromText(_ text: String) -> (title: String, date: Date?) {
        var cleanedText = text
            .replacingOccurrences(of: "(?i)rappelle-moi (de |d')?", with: "", options: .regularExpression)
            .replacingOccurrences(of: "(?i)crée un rappel (pour |de |d')?", with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)

        var date: Date? = nil
        let lower = text.lowercased()

        if lower.contains("demain") {
            date = Calendar.current.date(byAdding: .day, value: 1, to: Date())
            cleanedText = cleanedText.replacingOccurrences(of: "(?i)demain", with: "", options: .regularExpression)
        } else if lower.contains("dans une heure") || lower.contains("dans 1 heure") {
            date = Calendar.current.date(byAdding: .hour, value: 1, to: Date())
        } else if lower.contains("dans 30 minutes") {
            date = Calendar.current.date(byAdding: .minute, value: 30, to: Date())
        } else if lower.contains("ce soir") {
            var components = Calendar.current.dateComponents([.year, .month, .day], from: Date())
            components.hour = 20
            components.minute = 0
            date = Calendar.current.date(from: components)
        }

        return (cleanedText.isEmpty ? text : cleanedText, date)
    }
}

enum ReminderError: LocalizedError {
    case notAuthorized
    var errorDescription: String? { "Accès aux rappels non autorisé" }
}
