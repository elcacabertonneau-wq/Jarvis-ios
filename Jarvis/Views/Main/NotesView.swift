import SwiftUI

struct NotesView: View {
    @StateObject private var notesService = NotesService.shared
    @Environment(\.dismiss) var dismiss
    @State private var searchQuery = ""
    @State private var showingNewNote = false
    @State private var newNoteTitle = ""
    @State private var newNoteContent = ""
    @State private var selectedNote: JarvisNote? = nil

    var filteredNotes: [JarvisNote] {
        notesService.search(query: searchQuery)
    }

    var body: some View {
        ZStack {
            HolographicBackground()

            VStack(spacing: 0) {
                // Header
                HStack {
                    Button(action: { dismiss() }) {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .light))
                            .foregroundColor(AppConstants.Colors.primaryCyan)
                    }

                    Spacer()

                    Text("NOTES JARVIS")
                        .font(AppConstants.Fonts.hudSubtitle)
                        .foregroundColor(AppConstants.Colors.primaryCyan)
                        .tracking(4)

                    Spacer()

                    Button(action: { showingNewNote = true }) {
                        Image(systemName: "plus")
                            .font(.system(size: 16, weight: .light))
                            .foregroundColor(AppConstants.Colors.primaryCyan)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 16)
                .background(Rectangle().fill(.ultraThinMaterial).overlay(Rectangle().fill(AppConstants.Colors.darkBackground.opacity(0.7))))

                // Search
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass")
                        .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.6))
                        .font(.system(size: 14))
                    TextField("", text: $searchQuery, prompt:
                        Text("Rechercher une note...")
                            .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.4))
                            .font(.system(size: 13, weight: .light, design: .monospaced))
                    )
                    .font(.system(size: 13, weight: .light))
                    .foregroundColor(.white)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .glassmorphic(cornerRadius: 10)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)

                if filteredNotes.isEmpty {
                    Spacer()
                    VStack(spacing: 12) {
                        Image(systemName: "note.text")
                            .font(.system(size: 40, weight: .ultraLight))
                            .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.3))
                        Text(searchQuery.isEmpty ? "Aucune note" : "Aucun résultat")
                            .font(AppConstants.Fonts.hudSubtitle)
                            .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.5))
                            .tracking(2)
                        if searchQuery.isEmpty {
                            Button("Créer une note") { showingNewNote = true }
                                .font(AppConstants.Fonts.hudBody)
                                .foregroundColor(AppConstants.Colors.primaryCyan)
                        }
                    }
                    Spacer()
                } else {
                    ScrollView {
                        LazyVStack(spacing: 8) {
                            ForEach(filteredNotes) { note in
                                NoteRowView(note: note) {
                                    selectedNote = note
                                } onDelete: {
                                    notesService.deleteNote(id: note.id)
                                }
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                    }
                }
            }
        }
        .sheet(isPresented: $showingNewNote) {
            NewNoteView(onSave: { title, content in
                _ = notesService.createNote(title: title, content: content)
                showingNewNote = false
            })
        }
        .sheet(item: $selectedNote) { note in
            NoteDetailView(note: note)
        }
        .preferredColorScheme(.dark)
    }
}

private func noteTimeString(_ date: Date) -> String {
    let f = DateFormatter()
    f.dateFormat = "dd/MM HH:mm"
    return f.string(from: date)
}

struct NoteRowView: View {
    let note: JarvisNote
    let onTap: () -> Void
    let onDelete: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(note.title)
                        .font(.system(size: 13, weight: .medium, design: .monospaced))
                        .foregroundColor(.white)
                        .lineLimit(1)
                    Spacer()
                    Text(noteTimeString(note.updatedAt))
                        .font(.system(size: 9, weight: .light, design: .monospaced))
                        .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.5))
                }

                Text(note.content)
                    .font(.system(size: 11, weight: .light))
                    .foregroundColor(.white.opacity(0.5))
                    .lineLimit(2)

                if !note.tags.isEmpty {
                    HStack(spacing: 4) {
                        ForEach(note.tags.prefix(3), id: \.self) { tag in
                            Text("#\(tag)")
                                .font(.system(size: 9, weight: .light, design: .monospaced))
                                .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.6))
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Capsule().fill(AppConstants.Colors.primaryCyan.opacity(0.1)))
                        }
                    }
                }
            }
            .padding(12)
            .glassmorphic(cornerRadius: 12)
        }
        .swipeActions(edge: .trailing) {
            Button(role: .destructive, action: onDelete) {
                Label("Supprimer", systemImage: "trash")
            }
        }
    }
}

struct NewNoteView: View {
    @State private var title = ""
    @State private var content = ""
    let onSave: (String, String) -> Void
    @Environment(\.dismiss) var dismiss

    var body: some View {
        ZStack {
            HolographicBackground()
            VStack(spacing: 16) {
                HStack {
                    Button("Annuler") { dismiss() }
                        .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.7))
                    Spacer()
                    Text("NOUVELLE NOTE")
                        .font(AppConstants.Fonts.hudSubtitle)
                        .foregroundColor(AppConstants.Colors.primaryCyan)
                        .tracking(3)
                    Spacer()
                    Button("Sauvegarder") {
                        guard !title.isEmpty else { return }
                        onSave(title, content)
                    }
                    .foregroundColor(AppConstants.Colors.primaryCyan)
                    .disabled(title.isEmpty)
                }
                .padding()

                TextField("Titre", text: $title)
                    .font(.system(size: 18, weight: .light))
                    .foregroundColor(.white)
                    .padding()
                    .glassmorphic(cornerRadius: 10)
                    .padding(.horizontal)

                TextEditor(text: $content)
                    .font(.system(size: 14, weight: .light))
                    .foregroundColor(.white)
                    .scrollContentBackground(.hidden)
                    .padding()
                    .glassmorphic(cornerRadius: 10)
                    .padding(.horizontal)
            }
        }
        .preferredColorScheme(.dark)
    }
}

struct NoteDetailView: View {
    let note: JarvisNote
    @Environment(\.dismiss) var dismiss

    var body: some View {
        ZStack {
            HolographicBackground()
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Button("Fermer") { dismiss() }
                        .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.7))
                    Spacer()
                    Button(action: {
                        SpeechSynthesisService.shared.speakJarvisResponse(note.content)
                    }) {
                        Image(systemName: "speaker.wave.2")
                            .foregroundColor(AppConstants.Colors.primaryCyan)
                    }
                }
                .padding()

                Text(note.title)
                    .font(.system(size: 22, weight: .light, design: .monospaced))
                    .foregroundColor(AppConstants.Colors.primaryCyan)
                    .padding(.horizontal)

                ScrollView {
                    Text(note.content)
                        .font(.system(size: 14, weight: .light))
                        .foregroundColor(.white.opacity(0.9))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding()
                }
                Spacer()
            }
        }
        .preferredColorScheme(.dark)
    }
}
