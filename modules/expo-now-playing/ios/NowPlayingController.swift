import Foundation
import MediaPlayer
import UIKit

final class NowPlayingController {
  static let shared = NowPlayingController()

  private var currentTitle: String = ""
  private var currentSubtitle: String = ""
  private var currentArtworkUri: String?
  private var artworkTask: URLSessionDataTask?

  func update(title: String, subtitle: String, artworkUri: String?) {
    currentTitle = title
    currentSubtitle = subtitle

    var info: [String: Any] = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
    info[MPMediaItemPropertyTitle] = title
    info[MPMediaItemPropertyArtist] = subtitle
    MPNowPlayingInfoCenter.default().nowPlayingInfo = info

    if artworkUri != currentArtworkUri {
      currentArtworkUri = artworkUri
      loadArtworkAsync(artworkUri)
    }
  }

  func setPlaying(_ isPlaying: Bool) {
    var info: [String: Any] = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
    info[MPNowPlayingInfoPropertyPlaybackRate] = isPlaying ? 1.0 : 0.0
    MPNowPlayingInfoCenter.default().nowPlayingInfo = info
  }

  func reset() {
    MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    artworkTask?.cancel()
    artworkTask = nil
    currentArtworkUri = nil
  }

  private func loadArtworkAsync(_ uri: String?) {
    artworkTask?.cancel()
    artworkTask = nil
    guard let uri = uri, let url = URL(string: uri) else { return }

    let snapshotTitle = currentTitle
    let task = URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
      guard let self = self,
            let data = data,
            let image = UIImage(data: data),
            self.currentTitle == snapshotTitle else { return }
      let artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
      DispatchQueue.main.async {
        var info: [String: Any] = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
        info[MPMediaItemPropertyArtwork] = artwork
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
      }
    }
    task.resume()
    artworkTask = task
  }
}
