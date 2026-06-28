import Foundation
import EventKit

final class CalendarService {
    static let shared = CalendarService()
    private let eventStore = EKEventStore()
    private init() {}

    func requestPermission() async -> Bool {
        do {
            if #available(iOS 17.0, *) {
                return try await eventStore.requestFullAccessToEvents()
            } else {
                return try await eventStore.requestAccess(to: .event)
            }
        } catch {
            return false
        }
    }

    func fetchUpcomingEvents(days: Int = 7) async throws -> [EKEvent] {
        let authorized = await requestPermission()
        guard authorized else { throw CalendarError.notAuthorized }

        let start = Date()
        let end = Calendar.current.date(byAdding: .day, value: days, to: start) ?? start
        let predicate = eventStore.predicateForEvents(withStart: start, end: end, calendars: nil)
        return eventStore.events(matching: predicate).sorted { $0.startDate < $1.startDate }
    }

    func createEvent(title: String, startDate: Date, endDate: Date, notes: String? = nil) async throws -> Bool {
        let authorized = await requestPermission()
        guard authorized else { throw CalendarError.notAuthorized }

        let event = EKEvent(eventStore: eventStore)
        event.title = title
        event.startDate = startDate
        event.endDate = endDate
        event.notes = notes
        event.calendar = eventStore.defaultCalendarForNewEvents

        try eventStore.save(event, span: .thisEvent)
        return true
    }

    func upcomingEventsDescription() async -> String {
        guard let events = try? await fetchUpcomingEvents(days: 7), !events.isEmpty else {
            return "Aucun événement prévu dans les 7 prochains jours."
        }

        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE d MMMM 'à' HH:mm"
        formatter.locale = Locale(identifier: "fr_FR")

        let list = events.prefix(10).map { event in
            "- \(event.title ?? "Sans titre") : \(formatter.string(from: event.startDate))"
        }.joined(separator: "\n")

        return "Voici vos prochains événements :\n\(list)"
    }
}

enum CalendarError: LocalizedError {
    case notAuthorized
    case saveFailed(String)

    var errorDescription: String? {
        switch self {
        case .notAuthorized: return "Accès au calendrier non autorisé"
        case .saveFailed(let msg): return "Sauvegarde échouée: \(msg)"
        }
    }
}
