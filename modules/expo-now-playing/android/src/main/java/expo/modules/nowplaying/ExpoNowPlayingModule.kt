package expo.modules.nowplaying

import android.app.Activity
import android.app.Application
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoNowPlayingModule : Module(), NowPlayingService.Callbacks {

  private var serviceStarted = false
  private val mainHandler = Handler(Looper.getMainLooper())
  private var pendingMetadata: Triple<String, String, Uri?>? = null
  private var pendingState: String? = null
  private var lifecycleCallbacks: Application.ActivityLifecycleCallbacks? = null

  override fun definition() = ModuleDefinition {
    Name("ExpoNowPlaying")

    Events("play", "pause", "next", "previous", "interruption-begin", "interruption-end")

    OnCreate {
      NowPlayingService.eventCallbacks = this@ExpoNowPlayingModule
      registerLifecycleCallbacks()
    }
    OnDestroy {
      unregisterLifecycleCallbacks()
      mainHandler.post {
        NowPlayingService.eventCallbacks = null
        NowPlayingService.instance?.stopFromRn()
        serviceStarted = false
      }
    }

    AsyncFunction("update") { metadata: Map<String, Any?> ->
      val title = metadata["title"] as? String ?: ""
      val subtitle = metadata["subtitle"] as? String ?: ""
      val artworkStr = metadata["artworkUri"] as? String
      val artworkUri = artworkStr?.let { Uri.parse(it) }

      mainHandler.post {
        val svc = NowPlayingService.instance
        if (svc != null) {
          svc.updateMetadata(title, subtitle, artworkUri)
        } else {
          pendingMetadata = Triple(title, subtitle, artworkUri)
        }
      }
    }

    AsyncFunction("setState") { state: String ->
      mainHandler.post {
        when (state) {
          "playing" -> {
            ensureServiceStarted()
            val svc = NowPlayingService.instance
            if (svc != null) {
              svc.applyState("playing")
            } else {
              pendingState = "playing"
            }
          }
          "paused" -> {
            val svc = NowPlayingService.instance
            if (svc != null) {
              svc.applyState("paused")
            } else {
              pendingState = "paused"
            }
          }
          "stopped" -> {
            pendingState = null
            pendingMetadata = null
            NowPlayingService.instance?.applyState("stopped")
            NowPlayingService.instance?.stopFromRn()
            serviceStarted = false
          }
        }
      }
    }

    AsyncFunction("reset") {
      mainHandler.post {
        NowPlayingService.instance?.stopFromRn()
        serviceStarted = false
      }
    }
  }

  // ───────── service callbacks ─────────

  override fun onRemotePlay() = sendEvent("play")
  override fun onRemotePause() = sendEvent("pause")
  override fun onRemoteNext() = sendEvent("next")
  override fun onRemotePrevious() = sendEvent("previous")
  override fun onInterruptionBegin() = sendEvent("interruption-begin")
  override fun onInterruptionEnd() = sendEvent("interruption-end")
  override fun onServiceReady() {
    mainHandler.post {
      val svc = NowPlayingService.instance ?: return@post
      pendingMetadata?.let { svc.updateMetadata(it.first, it.second, it.third) }
      pendingMetadata = null
      pendingState?.let { svc.applyState(it) }
      pendingState = null
    }
  }

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

  // While the foreground service is active, we re-resume the ReactHost right
  // after the activity pauses. ReactActivity's onPause calls
  // ReactHost.onHostPause, which puts JavaTimerManager into paused state and
  // freezes setTimeout / event delivery to JS. Calling onHostResume again here
  // flips it back, so timers / events keep firing while playback continues in
  // background. When the service isn't active we leave the default behavior
  // alone so the JS thread can idle normally.
  private fun registerLifecycleCallbacks() {
    val app = appContext.reactContext?.applicationContext as? Application ?: return
    val callbacks = object : Application.ActivityLifecycleCallbacks {
      override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}
      override fun onActivityStarted(activity: Activity) {}
      override fun onActivityResumed(activity: Activity) {}
      override fun onActivityPaused(activity: Activity) {
        if (!serviceStarted) return
        // Use reflection to avoid a hard compile-time dep on react-android from
        // this module. Equivalent to:
        //   (activity.applicationContext as ReactApplication).reactHost?.onHostResume(activity)
        try {
          val app = activity.applicationContext
          val reactHost = app.javaClass.getMethod("getReactHost").invoke(app) ?: return
          reactHost.javaClass
            .getMethod("onHostResume", Activity::class.java)
            .invoke(reactHost, activity)
        } catch (e: Exception) {
          // Best-effort; if RN internals reject we just fall back to default pause.
        }
      }
      override fun onActivityStopped(activity: Activity) {}
      override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
      override fun onActivityDestroyed(activity: Activity) {}
    }
    app.registerActivityLifecycleCallbacks(callbacks)
    lifecycleCallbacks = callbacks
  }

  private fun unregisterLifecycleCallbacks() {
    val app = appContext.reactContext?.applicationContext as? Application ?: return
    lifecycleCallbacks?.let { app.unregisterActivityLifecycleCallbacks(it) }
    lifecycleCallbacks = null
  }
}
