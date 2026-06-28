import SwiftUI
import AVFoundation

struct SettingsView: View {
    @StateObject private var viewModel = SettingsViewModel()
    @EnvironmentObject var settingsManager: SettingsManager
    @Environment(\.dismiss) var dismiss

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

                    Text("CONFIGURATION")
                        .font(AppConstants.Fonts.hudSubtitle)
                        .foregroundColor(AppConstants.Colors.primaryCyan)
                        .tracking(4)

                    Spacer()

                    Button("Réinitialiser") {
                        viewModel.resetAllSettings()
                    }
                    .font(.system(size: 11, weight: .light, design: .monospaced))
                    .foregroundColor(AppConstants.Colors.dangerRed.opacity(0.7))
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 16)
                .background(Rectangle().fill(.ultraThinMaterial).overlay(Rectangle().fill(AppConstants.Colors.darkBackground.opacity(0.7))))

                ScrollView {
                    VStack(spacing: 16) {
                        // AI Provider Section
                        aiProviderSection

                        // API Keys Section
                        apiKeysSection

                        // Voice Section
                        voiceSection

                        // Interface Section
                        interfaceSection

                        // Permissions Section
                        permissionsSection

                        // About Section
                        aboutSection
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 16)
                }
            }
        }
        .preferredColorScheme(.dark)
    }

    private var aiProviderSection: some View {
        HUDPanel(title: "FOURNISSEUR IA", icon: "brain.head.profile") {
            VStack(spacing: 12) {
                // Provider picker
                ForEach(AIProvider.allCases) { provider in
                    Button(action: {
                        settingsManager.settings.selectedProvider = provider
                        settingsManager.settings.selectedModel = provider.defaultModel
                        HapticManager.shared.selection()
                    }) {
                        HStack(spacing: 12) {
                            Image(systemName: provider.icon)
                                .font(.system(size: 16, weight: .light))
                                .foregroundColor(
                                    settingsManager.settings.selectedProvider == provider
                                        ? AppConstants.Colors.primaryCyan
                                        : .white.opacity(0.5)
                                )
                                .frame(width: 24)

                            VStack(alignment: .leading, spacing: 2) {
                                Text(provider.rawValue)
                                    .font(.system(size: 13, weight: .medium, design: .monospaced))
                                    .foregroundColor(
                                        settingsManager.settings.selectedProvider == provider
                                            ? AppConstants.Colors.primaryCyan
                                            : .white.opacity(0.7)
                                    )
                                Text(provider.defaultModel)
                                    .font(.system(size: 10, weight: .light, design: .monospaced))
                                    .foregroundColor(.white.opacity(0.35))
                            }

                            Spacer()

                            if settingsManager.settings.selectedProvider == provider {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundColor(AppConstants.Colors.primaryCyan)
                                    .font(.system(size: 16))
                            }

                            StatusBadge(
                                text: provider.hasAPIKey ? "CLÉ OK" : "PAS DE CLÉ",
                                isOnline: provider.hasAPIKey
                            )
                        }
                        .padding(10)
                        .background(
                            RoundedRectangle(cornerRadius: 8)
                                .fill(settingsManager.settings.selectedProvider == provider
                                    ? AppConstants.Colors.primaryCyan.opacity(0.08)
                                    : Color.clear)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 8)
                                        .stroke(
                                            settingsManager.settings.selectedProvider == provider
                                                ? AppConstants.Colors.primaryCyan.opacity(0.4)
                                                : Color.clear,
                                            lineWidth: 0.5
                                        )
                                )
                        )
                    }
                }

                // Model selection
                if settingsManager.settings.selectedProvider != .local {
                    Divider().background(AppConstants.Colors.primaryCyan.opacity(0.2))

                    VStack(alignment: .leading, spacing: 8) {
                        Text("MODÈLE")
                            .font(AppConstants.Fonts.hudSmall)
                            .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.7))
                            .tracking(2)

                        Picker("Modèle", selection: $settingsManager.settings.selectedModel) {
                            ForEach(settingsManager.settings.selectedProvider.availableModels, id: \.self) { model in
                                Text(model)
                                    .font(.system(size: 12, weight: .light, design: .monospaced))
                                    .foregroundColor(.white)
                                    .tag(model)
                            }
                        }
                        .pickerStyle(.menu)
                        .accentColor(AppConstants.Colors.primaryCyan)
                    }
                }
            }
        }
    }

    private var apiKeysSection: some View {
        HUDPanel(title: "CLÉS API", icon: "key.fill") {
            VStack(spacing: 12) {
                APIKeyRow(
                    provider: "OPENAI",
                    placeholder: "sk-...",
                    key: $viewModel.openAIKey,
                    isShown: $viewModel.showOpenAIKey,
                    onSave: { viewModel.saveKey(viewModel.openAIKey, for: .openAI) },
                    onDelete: { viewModel.deleteKey(for: .openAI) },
                    onTest: { viewModel.testConnection(for: .openAI) }
                )
                Divider().background(AppConstants.Colors.primaryCyan.opacity(0.2))
                APIKeyRow(
                    provider: "CLAUDE",
                    placeholder: "sk-ant-...",
                    key: $viewModel.claudeKey,
                    isShown: $viewModel.showClaudeKey,
                    onSave: { viewModel.saveKey(viewModel.claudeKey, for: .claude) },
                    onDelete: { viewModel.deleteKey(for: .claude) },
                    onTest: { viewModel.testConnection(for: .claude) }
                )
                Divider().background(AppConstants.Colors.primaryCyan.opacity(0.2))
                APIKeyRow(
                    provider: "GEMINI",
                    placeholder: "AIzaSy...",
                    key: $viewModel.geminiKey,
                    isShown: $viewModel.showGeminiKey,
                    onSave: { viewModel.saveKey(viewModel.geminiKey, for: .gemini) },
                    onDelete: { viewModel.deleteKey(for: .gemini) },
                    onTest: { viewModel.testConnection(for: .gemini) }
                )

                if let result = viewModel.testResult {
                    Text(result)
                        .font(.system(size: 11, weight: .light, design: .monospaced))
                        .foregroundColor(result.hasPrefix("✓") ? AppConstants.Colors.neonGreen : AppConstants.Colors.dangerRed)
                        .padding(.top, 4)
                }
            }
        }
    }

    private var voiceSection: some View {
        HUDPanel(title: "VOIX & AUDIO", icon: "waveform") {
            VStack(spacing: 12) {
                SettingsToggle(title: "Lecture auto des réponses", isOn: $settingsManager.settings.autoReadResponses)
                SettingsToggle(title: "Effets sonores", isOn: $settingsManager.settings.soundEffectsEnabled)
                SettingsToggle(title: "Retour haptique", isOn: $settingsManager.settings.hapticFeedbackEnabled)
                SettingsToggle(title: "Streaming", isOn: $settingsManager.settings.streamingEnabled)

                Divider().background(AppConstants.Colors.primaryCyan.opacity(0.2))

                VStack(alignment: .leading, spacing: 6) {
                    Text("LANGUE DE RECONNAISSANCE")
                        .font(AppConstants.Fonts.hudSmall)
                        .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.7))
                        .tracking(2)

                    Picker("Langue", selection: $settingsManager.settings.selectedLanguage) {
                        Text("Français").tag("fr-FR")
                        Text("Anglais").tag("en-US")
                        Text("Espagnol").tag("es-ES")
                        Text("Allemand").tag("de-DE")
                        Text("Italien").tag("it-IT")
                        Text("Portugais").tag("pt-BR")
                    }
                    .pickerStyle(.menu)
                    .accentColor(AppConstants.Colors.primaryCyan)
                }

                Divider().background(AppConstants.Colors.primaryCyan.opacity(0.2))

                VStack(alignment: .leading, spacing: 6) {
                    Text("VOIX JARVIS")
                        .font(AppConstants.Fonts.hudSmall)
                        .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.7))
                        .tracking(2)

                    Picker("Voix", selection: $settingsManager.settings.selectedVoiceIdentifier) {
                        ForEach(viewModel.availableVoices, id: \.identifier) { voice in
                            Text("\(voice.name) (\(voice.language))")
                                .font(.system(size: 11, weight: .light))
                                .tag(voice.identifier)
                        }
                    }
                    .pickerStyle(.menu)
                    .accentColor(AppConstants.Colors.primaryCyan)

                    Button(action: {
                        viewModel.previewVoice(settingsManager.settings.selectedVoiceIdentifier)
                    }) {
                        Label("Écouter la voix", systemImage: "speaker.wave.2")
                            .font(.system(size: 11, weight: .light, design: .monospaced))
                            .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.8))
                    }
                }
            }
        }
    }

    private var interfaceSection: some View {
        HUDPanel(title: "INTERFACE", icon: "paintbrush") {
            VStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("THÈME")
                        .font(AppConstants.Fonts.hudSmall)
                        .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.7))
                        .tracking(2)

                    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 2), spacing: 8) {
                        ForEach(AppTheme.allCases) { theme in
                            Button(action: { settingsManager.settings.theme = theme }) {
                                HStack(spacing: 8) {
                                    Circle()
                                        .fill(theme.primaryColor)
                                        .frame(width: 12, height: 12)
                                        .neonGlow(color: theme.primaryColor, radius: 4)
                                    Text(theme.rawValue)
                                        .font(.system(size: 11, weight: .light, design: .monospaced))
                                        .foregroundColor(settingsManager.settings.theme == theme ? theme.primaryColor : .white.opacity(0.6))
                                    if settingsManager.settings.theme == theme {
                                        Spacer()
                                        Image(systemName: "checkmark")
                                            .font(.system(size: 10))
                                            .foregroundColor(theme.primaryColor)
                                    }
                                }
                                .padding(8)
                                .background(
                                    RoundedRectangle(cornerRadius: 6)
                                        .fill(settingsManager.settings.theme == theme ? theme.primaryColor.opacity(0.1) : Color.clear)
                                        .overlay(RoundedRectangle(cornerRadius: 6).stroke(settingsManager.settings.theme == theme ? theme.primaryColor.opacity(0.5) : Color.white.opacity(0.1), lineWidth: 0.5))
                                )
                            }
                        }
                    }
                }

                Divider().background(AppConstants.Colors.primaryCyan.opacity(0.2))

                VStack(alignment: .leading, spacing: 6) {
                    Text("HISTORIQUE MAX")
                        .font(AppConstants.Fonts.hudSmall)
                        .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.7))
                        .tracking(2)
                    Slider(value: Binding(
                        get: { Double(settingsManager.settings.maxHistoryMessages) },
                        set: { settingsManager.settings.maxHistoryMessages = Int($0) }
                    ), in: 5...50, step: 5)
                    .accentColor(AppConstants.Colors.primaryCyan)
                    Text("\(settingsManager.settings.maxHistoryMessages) messages")
                        .font(AppConstants.Fonts.hudSmall)
                        .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.6))
                }

                if settingsManager.settings.selectedProvider == .local {
                    Divider().background(AppConstants.Colors.primaryCyan.opacity(0.2))
                    VStack(alignment: .leading, spacing: 6) {
                        Text("SERVEUR LOCAL (OLLAMA)")
                            .font(AppConstants.Fonts.hudSmall)
                            .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.7))
                            .tracking(2)
                        TextField("http://localhost:11434", text: $settingsManager.settings.localServerURL)
                            .font(.system(size: 12, weight: .light, design: .monospaced))
                            .foregroundColor(.white)
                            .padding(8)
                            .glassmorphic(cornerRadius: 8)
                    }
                }
            }
        }
    }

    private var permissionsSection: some View {
        HUDPanel(title: "PERMISSIONS", icon: "shield.lefthalf.filled") {
            let perms = PermissionsManager.shared.status
            VStack(spacing: 8) {
                PermissionRow(name: "Microphone", icon: "mic", isGranted: perms.microphone)
                PermissionRow(name: "Reconnaissance vocale", icon: "waveform", isGranted: perms.speech)
                PermissionRow(name: "Caméra", icon: "camera", isGranted: perms.camera)
                PermissionRow(name: "Calendrier", icon: "calendar", isGranted: perms.calendar)
                PermissionRow(name: "Rappels", icon: "bell", isGranted: perms.reminders)
                PermissionRow(name: "Notifications", icon: "bell.badge", isGranted: perms.notifications)
                PermissionRow(name: "Localisation", icon: "location", isGranted: perms.location)

                Button(action: {
                    Task { await PermissionsManager.shared.requestAll() }
                }) {
                    Text("Demander toutes les permissions")
                        .font(.system(size: 11, weight: .light, design: .monospaced))
                        .foregroundColor(AppConstants.Colors.primaryCyan)
                }
                .padding(.top, 4)
            }
        }
    }

    private var aboutSection: some View {
        HUDPanel(title: "À PROPOS", icon: "info.circle") {
            VStack(alignment: .leading, spacing: 6) {
                InfoRow(label: "Version", value: "1.0.0")
                InfoRow(label: "Build", value: "Iron Man Edition")
                InfoRow(label: "iOS", value: "18.0+")
                InfoRow(label: "Système", value: "JARVIS v1.0")
                InfoRow(label: "Modèle", value: settingsManager.settings.selectedModel)
            }
        }
    }
}

struct APIKeyRow: View {
    let provider: String
    let placeholder: String
    @Binding var key: String
    @Binding var isShown: Bool
    let onSave: () -> Void
    let onDelete: () -> Void
    let onTest: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(provider)
                .font(AppConstants.Fonts.hudSmall)
                .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.7))
                .tracking(2)

            HStack(spacing: 8) {
                Group {
                    if isShown {
                        TextField(placeholder, text: $key)
                    } else {
                        SecureField(placeholder, text: $key)
                    }
                }
                .font(.system(size: 11, weight: .light, design: .monospaced))
                .foregroundColor(.white)
                .padding(8)
                .background(RoundedRectangle(cornerRadius: 6).fill(AppConstants.Colors.primaryCyan.opacity(0.05)).overlay(RoundedRectangle(cornerRadius: 6).stroke(AppConstants.Colors.primaryCyan.opacity(0.2), lineWidth: 0.5)))

                Button(action: { isShown.toggle() }) {
                    Image(systemName: isShown ? "eye.slash" : "eye")
                        .font(.system(size: 12))
                        .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.6))
                }
            }

            HStack(spacing: 8) {
                Button("Sauvegarder", action: onSave)
                    .font(.system(size: 10, weight: .light, design: .monospaced))
                    .foregroundColor(AppConstants.Colors.neonGreen.opacity(0.8))
                Spacer()
                Button("Tester", action: onTest)
                    .font(.system(size: 10, weight: .light, design: .monospaced))
                    .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.8))
                Button("Supprimer", action: onDelete)
                    .font(.system(size: 10, weight: .light, design: .monospaced))
                    .foregroundColor(AppConstants.Colors.dangerRed.opacity(0.7))
            }
        }
    }
}

struct SettingsToggle: View {
    let title: String
    @Binding var isOn: Bool

    var body: some View {
        HStack {
            Text(title)
                .font(.system(size: 12, weight: .light, design: .monospaced))
                .foregroundColor(.white.opacity(0.8))
            Spacer()
            Toggle("", isOn: $isOn)
                .toggleStyle(SwitchToggleStyle(tint: AppConstants.Colors.primaryCyan))
                .labelsHidden()
        }
    }
}

struct PermissionRow: View {
    let name: String
    let icon: String
    let isGranted: Bool

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .light))
                .foregroundColor(isGranted ? AppConstants.Colors.primaryCyan : .white.opacity(0.4))
                .frame(width: 20)
            Text(name)
                .font(.system(size: 12, weight: .light, design: .monospaced))
                .foregroundColor(.white.opacity(0.7))
            Spacer()
            Image(systemName: isGranted ? "checkmark.circle.fill" : "xmark.circle")
                .font(.system(size: 14))
                .foregroundColor(isGranted ? AppConstants.Colors.neonGreen : AppConstants.Colors.dangerRed.opacity(0.7))
        }
    }
}

struct InfoRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label.uppercased())
                .font(.system(size: 9, weight: .light, design: .monospaced))
                .foregroundColor(AppConstants.Colors.primaryCyan.opacity(0.5))
                .tracking(2)
            Spacer()
            Text(value)
                .font(.system(size: 11, weight: .regular, design: .monospaced))
                .foregroundColor(.white.opacity(0.7))
        }
    }
}
