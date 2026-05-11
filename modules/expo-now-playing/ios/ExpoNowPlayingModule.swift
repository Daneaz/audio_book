import ExpoModulesCore
import AVFoundation

public class ExpoNowPlayingModule: Module {
  private var sessionActivated = false

  public func definition() -> ModuleDefinition {
    Name("ExpoNowPlaying")

    Events("play", "pause", "next", "previous", "interruption-begin", "interruption-end")

    OnCreate {
      RemoteCommandHandler.shared.onPlay = { [weak self] in
        NowPlayingController.shared.setPlaying(true)
        self?.sendEvent("play")
      }
      RemoteCommandHandler.shared.onPause = { [weak self] in
        NowPlayingController.shared.setPlaying(false)
        self?.silenceAudioOutput()
        self?.sendEvent("pause")
      }
      RemoteCommandHandler.shared.onNext = { [weak self] in self?.sendEvent("next") }
      RemoteCommandHandler.shared.onPrevious = { [weak self] in self?.sendEvent("previous") }

      AudioInterruptionObserver.shared.onBegin = { [weak self] in
        NowPlayingController.shared.setPlaying(false)
        self?.sendEvent("interruption-begin")
      }
      AudioInterruptionObserver.shared.onEnd = { [weak self] in
        self?.sendEvent("interruption-end")
      }
    }

    OnDestroy { [weak self] in
      DispatchQueue.main.async {
        RemoteCommandHandler.shared.unregister()
        AudioInterruptionObserver.shared.stop()
        self?.deactivateAudioSessionIfActive()
      }
    }

    AsyncFunction("update") { (metadata: [String: Any]) in
      let title = (metadata["title"] as? String) ?? ""
      let subtitle = (metadata["subtitle"] as? String) ?? ""
      let artworkUri = metadata["artworkUri"] as? String
      DispatchQueue.main.async {
        NowPlayingController.shared.update(title: title, subtitle: subtitle, artworkUri: artworkUri)
      }
    }

    AsyncFunction("setState") { (state: String) in
      DispatchQueue.main.async { [weak self] in
        guard let self = self else { return }
        switch state {
        case "playing":
          self.activateAudioSessionIfNeeded()
          RemoteCommandHandler.shared.register()
          AudioInterruptionObserver.shared.start()
          NowPlayingController.shared.setPlaying(true)
        case "paused":
          NowPlayingController.shared.setPlaying(false)
        case "stopped":
          NowPlayingController.shared.reset()
          RemoteCommandHandler.shared.unregister()
          AudioInterruptionObserver.shared.stop()
          self.deactivateAudioSessionIfActive()
        default:
          break
        }
      }
    }

    AsyncFunction("reset") {
      DispatchQueue.main.async { [weak self] in
        NowPlayingController.shared.reset()
        RemoteCommandHandler.shared.unregister()
        AudioInterruptionObserver.shared.stop()
        self?.deactivateAudioSessionIfActive()
      }
    }
  }

  private func activateAudioSessionIfNeeded() {
    guard !sessionActivated else { return }
    do {
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(.playback, mode: .spokenAudio, options: [])
      try session.setActive(true, options: [])
      sessionActivated = true
    } catch {
      print("[ExpoNowPlaying] AVAudioSession activate failed:", error)
    }
  }

  private func silenceAudioOutput() {
    do {
      try AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
      sessionActivated = false
    } catch {
      print("[ExpoNowPlaying] AVAudioSession silence failed:", error)
    }
  }

  private func deactivateAudioSessionIfActive() {
    guard sessionActivated else { return }
    do {
      try AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
      sessionActivated = false
    } catch {
      print("[ExpoNowPlaying] AVAudioSession setActive(false) failed:", error)
    }
  }
}
