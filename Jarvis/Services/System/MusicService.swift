import Foundation
import MediaPlayer
import StoreKit
import UIKit

final class MusicService {
    static let shared = MusicService()
    private let player = MPMusicPlayerController.applicationMusicPlayer
    private init() {}

    func requestPermission() async -> MPMediaLibraryAuthorizationStatus {
        await withCheckedContinuation { continuation in
            MPMediaLibrary.requestAuthorization { status in
                continuation.resume(returning: status)
            }
        }
    }

    func play(query: String) async throws -> String {
        let status = await requestPermission()
        guard status == .authorized else {
            return await openAppleMusic(query: query)
        }

        let predicate = MPMediaPropertyPredicate(
            value: query,
            forProperty: MPMediaItemPropertyTitle,
            comparisonType: .contains
        )
        let filter = Set([predicate])
        let queryObj = MPMediaQuery(filterPredicates: filter)

        if let items = queryObj.items, !items.isEmpty {
            let collection = MPMediaItemCollection(items: items)
            player.setQueue(with: collection)
            player.play()
            return "Lecture de '\(items.first?.title ?? query)' par \(items.first?.artist ?? "artiste inconnu"), Monsieur."
        } else {
            return await openAppleMusic(query: query)
        }
    }

    func pause() {
        player.pause()
    }

    func resume() {
        player.play()
    }

    func next() {
        player.skipToNextItem()
    }

    func previous() {
        player.skipToPreviousItem()
    }

    func setVolume(_ volume: Float) {
        MPVolumeView.setVolume(volume)
    }

    func openAppleMusic(query: String) async -> String {
        let encoded = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        if let url = URL(string: "music://search?term=\(encoded)"), UIApplication.shared.canOpenURL(url) {
            await UIApplication.shared.open(url)
            return "J'ouvre Apple Music pour '\(query)', Monsieur."
        }
        return "Je n'ai pas trouvé '\(query)' dans votre bibliothèque musicale, Monsieur."
    }

    func openSpotify(query: String) async -> String {
        let encoded = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        if let url = URL(string: "spotify:search:\(encoded)"), UIApplication.shared.canOpenURL(url) {
            await UIApplication.shared.open(url)
            return "J'ouvre Spotify pour '\(query)', Monsieur."
        } else if let webURL = URL(string: "https://open.spotify.com/search/\(encoded)") {
            await UIApplication.shared.open(webURL)
            return "J'ouvre Spotify dans le navigateur pour '\(query)', Monsieur."
        }
        return "Spotify ne semble pas installé, Monsieur."
    }

    var nowPlayingTitle: String? {
        player.nowPlayingItem?.title
    }

    var isPlaying: Bool {
        player.playbackState == .playing
    }
}

extension MPVolumeView {
    static func setVolume(_ volume: Float) {
        let volumeView = MPVolumeView()
        if let slider = volumeView.subviews.first(where: { $0 is UISlider }) as? UISlider {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.01) {
                slider.value = volume
            }
        }
    }
}
