import Foundation
import MediaPlayer

final class RemoteCommandHandler {
  static let shared = RemoteCommandHandler()

  private var registered = false
  private var playTarget: Any?
  private var pauseTarget: Any?
  private var nextTarget: Any?
  private var prevTarget: Any?

  var onPlay: (() -> Void)?
  var onPause: (() -> Void)?
  var onNext: (() -> Void)?
  var onPrevious: (() -> Void)?

  func register() {
    guard !registered else { return }
    registered = true

    let center = MPRemoteCommandCenter.shared()

    playTarget = center.playCommand.addTarget { [weak self] _ in
      self?.onPlay?()
      return .success
    }
    pauseTarget = center.pauseCommand.addTarget { [weak self] _ in
      self?.onPause?()
      return .success
    }
    nextTarget = center.nextTrackCommand.addTarget { [weak self] _ in
      self?.onNext?()
      return .success
    }
    prevTarget = center.previousTrackCommand.addTarget { [weak self] _ in
      self?.onPrevious?()
      return .success
    }

    center.skipForwardCommand.isEnabled = false
    center.skipBackwardCommand.isEnabled = false
    center.changePlaybackPositionCommand.isEnabled = false
    center.seekForwardCommand.isEnabled = false
    center.seekBackwardCommand.isEnabled = false

    center.playCommand.isEnabled = true
    center.pauseCommand.isEnabled = true
    center.nextTrackCommand.isEnabled = true
    center.previousTrackCommand.isEnabled = true
  }

  func unregister() {
    guard registered else { return }
    registered = false

    let center = MPRemoteCommandCenter.shared()
    if let t = playTarget { center.playCommand.removeTarget(t) }
    if let t = pauseTarget { center.pauseCommand.removeTarget(t) }
    if let t = nextTarget { center.nextTrackCommand.removeTarget(t) }
    if let t = prevTarget { center.previousTrackCommand.removeTarget(t) }
    playTarget = nil
    pauseTarget = nil
    nextTarget = nil
    prevTarget = nil

    center.playCommand.isEnabled = false
    center.pauseCommand.isEnabled = false
    center.nextTrackCommand.isEnabled = false
    center.previousTrackCommand.isEnabled = false
  }
}
