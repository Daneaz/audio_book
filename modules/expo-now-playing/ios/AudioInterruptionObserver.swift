import Foundation
import AVFoundation

final class AudioInterruptionObserver {
  static let shared = AudioInterruptionObserver()

  var onBegin: (() -> Void)?
  var onEnd: (() -> Void)?

  private var registered = false

  func start() {
    guard !registered else { return }
    registered = true
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleInterruption(_:)),
      name: AVAudioSession.interruptionNotification,
      object: nil
    )
  }

  func stop() {
    guard registered else { return }
    registered = false
    NotificationCenter.default.removeObserver(self,
      name: AVAudioSession.interruptionNotification,
      object: nil
    )
  }

  @objc private func handleInterruption(_ notification: Notification) {
    guard let info = notification.userInfo,
          let typeRaw = info[AVAudioSessionInterruptionTypeKey] as? UInt,
          let type = AVAudioSession.InterruptionType(rawValue: typeRaw) else { return }

    switch type {
    case .began:
      DispatchQueue.main.async { [weak self] in
        self?.onBegin?()
      }
    case .ended:
      let optsRaw = info[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
      let opts = AVAudioSession.InterruptionOptions(rawValue: optsRaw)
      if opts.contains(.shouldResume) {
        DispatchQueue.main.async { [weak self] in
          self?.onEnd?()
        }
      }
    @unknown default:
      break
    }
  }
}
