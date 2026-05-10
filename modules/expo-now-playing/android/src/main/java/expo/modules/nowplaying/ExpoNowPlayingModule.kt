package expo.modules.nowplaying

import android.content.Intent
import android.net.Uri
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoNowPlayingModule : Module(), NowPlayingService.Callbacks {

  private var serviceStarted = false

  override fun definition() = ModuleDefinition {
    Name("ExpoNowPlaying")

    Events("play", "pause", "next", "previous", "interruption-begin", "interruption-end")

    OnCreate {
      NowPlayingService.eventCallbacks = this@ExpoNowPlayingModule
    }
    OnDestroy {
      NowPlayingService.eventCallbacks = null
      NowPlayingService.instance?.stopFromRn()
      serviceStarted = false
    }

    AsyncFunction("update") { metadata: Map<String, Any?> ->
      val title = metadata["title"] as? String ?: ""
      val subtitle = metadata["subtitle"] as? String ?: ""
      val artworkStr = metadata["artworkUri"] as? String
      val artworkUri = artworkStr?.let { Uri.parse(it) }

      NowPlayingService.instance?.updateMetadata(title, subtitle, artworkUri)
    }

    AsyncFunction("setState") { state: String ->
      when (state) {
        "playing" -> {
          ensureServiceStarted()
          NowPlayingService.instance?.applyState("playing")
        }
        "paused" -> {
          NowPlayingService.instance?.applyState("paused")
        }
        "stopped" -> {
          NowPlayingService.instance?.applyState("stopped")
          NowPlayingService.instance?.stopFromRn()
          serviceStarted = false
        }
      }
    }

    AsyncFunction("reset") {
      NowPlayingService.instance?.stopFromRn()
      serviceStarted = false
    }
  }

  // ───────── service callbacks ─────────

  override fun onRemotePlay() = sendEvent("play")
  override fun onRemotePause() = sendEvent("pause")
  override fun onRemoteNext() = sendEvent("next")
  override fun onRemotePrevious() = sendEvent("previous")
  override fun onInterruptionBegin() = sendEvent("interruption-begin")
  override fun onInterruptionEnd() = sendEvent("interruption-end")

  // ───────── private ─────────

  private fun ensureServiceStarted() {
    if (serviceStarted) return
    val ctx = appContext.reactContext ?: return
    val intent = Intent(ctx, NowPlayingService::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      ctx.startForegroundService(intent)
    } else {
      ctx.startService(intent)
    }
    serviceStarted = true
  }
}
