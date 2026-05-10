package expo.modules.nowplaying

import android.app.PendingIntent
import android.app.Service
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService

class NowPlayingService : MediaSessionService(), AudioManager.OnAudioFocusChangeListener {

  private var mediaSession: MediaSession? = null
  private var player: PlayerStub? = null
  private var audioManager: AudioManager? = null
  private var focusRequest: AudioFocusRequest? = null
  private var hasTransientLoss = false

  companion object {
    @Volatile var instance: NowPlayingService? = null
    @Volatile var eventCallbacks: Callbacks? = null
  }

  interface Callbacks {
    fun onRemotePlay()
    fun onRemotePause()
    fun onRemoteNext()
    fun onRemotePrevious()
    fun onInterruptionBegin()
    fun onInterruptionEnd()
  }

  override fun onCreate() {
    super.onCreate()
    instance = this
    audioManager = getSystemService(AUDIO_SERVICE) as AudioManager

    val stub = PlayerStub(
      onPlay = { eventCallbacks?.onRemotePlay() },
      onPause = { eventCallbacks?.onRemotePause() },
      onNext = { eventCallbacks?.onRemoteNext() },
      onPrevious = { eventCallbacks?.onRemotePrevious() },
    )
    player = stub

    val sessionActivityIntent = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(
        this, 0, it,
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
      )
    }

    mediaSession = MediaSession.Builder(this, stub)
      .apply { sessionActivityIntent?.let { setSessionActivity(it) } }
      .build()
  }

  override fun onGetSession(controllerInfo: MediaSession.ControllerInfo) = mediaSession

  override fun onDestroy() {
    abandonAudioFocus()
    mediaSession?.run {
      player.release()
      release()
    }
    mediaSession = null
    player = null
    instance = null
    super.onDestroy()
  }

  fun updateMetadata(title: String, subtitle: String, artworkUri: android.net.Uri?) {
    player?.setMetadata(title, subtitle, artworkUri)
  }

  fun applyState(state: String) {
    when (state) {
      "playing" -> {
        requestAudioFocus()
        player?.setIsPlaying(true)
      }
      "paused" -> {
        player?.setIsPlaying(false)
      }
      "stopped" -> {
        player?.setIsPlaying(false)
        abandonAudioFocus()
      }
    }
  }

  fun stopFromRn() {
    abandonAudioFocus()
    stopForeground(Service.STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun requestAudioFocus() {
    val am = audioManager ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val attrs = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build()
      val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
        .setAudioAttributes(attrs)
        .setOnAudioFocusChangeListener(this)
        .build()
      focusRequest = req
      am.requestAudioFocus(req)
    } else {
      @Suppress("DEPRECATION")
      am.requestAudioFocus(this, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN)
    }
  }

  private fun abandonAudioFocus() {
    val am = audioManager ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      focusRequest?.let { am.abandonAudioFocusRequest(it) }
      focusRequest = null
    } else {
      @Suppress("DEPRECATION")
      am.abandonAudioFocus(this)
    }
  }

  override fun onAudioFocusChange(focusChange: Int) {
    when (focusChange) {
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT,
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
        hasTransientLoss = true
        player?.setIsPlaying(false)
        eventCallbacks?.onInterruptionBegin()
      }
      AudioManager.AUDIOFOCUS_GAIN -> {
        if (hasTransientLoss) {
          hasTransientLoss = false
          eventCallbacks?.onInterruptionEnd()
        }
      }
      AudioManager.AUDIOFOCUS_LOSS -> {
        hasTransientLoss = false
        eventCallbacks?.onRemotePause()
      }
    }
  }
}
