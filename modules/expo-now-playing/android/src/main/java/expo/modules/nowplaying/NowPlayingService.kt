package expo.modules.nowplaying

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.ConcatenatingMediaSource2
import androidx.media3.exoplayer.source.MediaSource
import androidx.media3.exoplayer.source.SilenceMediaSource
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService

@OptIn(UnstableApi::class)
class NowPlayingService : MediaSessionService() {

  private var mediaSession: MediaSession? = null
  private var exoPlayer: ExoPlayer? = null

  companion object {
    @Volatile var instance: NowPlayingService? = null
    @Volatile var eventCallbacks: Callbacks? = null
    private const val PLACEHOLDER_NOTIFICATION_ID = 1001
    private const val PLACEHOLDER_CHANNEL_ID = "now_playing_session"
    const val ACTION_PLAY = "expo.modules.nowplaying.ACTION_PLAY"
    const val ACTION_PAUSE = "expo.modules.nowplaying.ACTION_PAUSE"
    const val ACTION_NEXT = "expo.modules.nowplaying.ACTION_NEXT"
    const val ACTION_PREV = "expo.modules.nowplaying.ACTION_PREV"
  }

  interface Callbacks {
    fun onRemotePlay()
    fun onRemotePause()
    fun onRemoteNext()
    fun onRemotePrevious()
    fun onInterruptionBegin()
    fun onInterruptionEnd()
    fun onServiceReady()
  }

  override fun onCreate() {
    super.onCreate()
    instance = this

    val exo = ExoPlayer.Builder(this).build().apply {
      volume = 0f
      repeatMode = Player.REPEAT_MODE_ONE
    }
    exoPlayer = exo
    exo.addListener(object : Player.Listener {
      override fun onIsPlayingChanged(isPlaying: Boolean) {
        showNotification()
      }
      override fun onMediaMetadataChanged(mediaMetadata: MediaMetadata) {
        showNotification()
      }
    })
    exo.setMediaSource(buildSilenceSource(MediaMetadata.EMPTY))
    exo.prepare()

    val notifyingPlayer = NotifyingPlayer(
      delegate = exo,
      onPlayCmd = { eventCallbacks?.onRemotePlay() },
      onPauseCmd = { eventCallbacks?.onRemotePause() },
      onNextCmd = { eventCallbacks?.onRemoteNext() },
      onPreviousCmd = { eventCallbacks?.onRemotePrevious() },
    )

    val sessionActivityIntent = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(
        this, 0, it,
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
      )
    }

    mediaSession = MediaSession.Builder(this, notifyingPlayer)
      .apply { sessionActivityIntent?.let { setSessionActivity(it) } }
      .build()

    ensureNotificationChannel()
    showNotification()
    eventCallbacks?.onServiceReady()
  }

  override fun onGetSession(controllerInfo: MediaSession.ControllerInfo) = mediaSession

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_PLAY -> eventCallbacks?.onRemotePlay()
      ACTION_PAUSE -> eventCallbacks?.onRemotePause()
      ACTION_NEXT -> eventCallbacks?.onRemoteNext()
      ACTION_PREV -> eventCallbacks?.onRemotePrevious()
      else -> return super.onStartCommand(intent, flags, startId)
    }
    return Service.START_NOT_STICKY
  }

  override fun onDestroy() {
    mediaSession?.run {
      release()
    }
    exoPlayer?.release()
    mediaSession = null
    exoPlayer = null
    instance = null
    super.onDestroy()
  }

  fun updateMetadata(title: String, subtitle: String, artworkUri: android.net.Uri?) {
    val exo = exoPlayer ?: return
    val metadata = MediaMetadata.Builder()
      .setTitle(title)
      .setArtist(subtitle)
      .apply { if (artworkUri != null) setArtworkUri(artworkUri) }
      .build()
    val wasPlaying = exo.playWhenReady
    exo.setMediaSource(buildSilenceSource(metadata))
    exo.prepare()
    exo.playWhenReady = wasPlaying
  }

  fun applyState(state: String) {
    val exo = exoPlayer ?: return
    when (state) {
      "playing" -> exo.playWhenReady = true
      "paused" -> exo.playWhenReady = false
      "stopped" -> exo.playWhenReady = false
    }
  }

  fun stopFromRn() {
    exoPlayer?.playWhenReady = false
    stopForeground(Service.STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun buildSilenceSource(metadata: MediaMetadata): MediaSource {
    val mediaItem = MediaItem.Builder()
      .setMediaId("now-playing")
      .setMediaMetadata(metadata)
      .build()
    val silence = SilenceMediaSource.Factory()
      .setDurationUs(Long.MAX_VALUE)
      .createMediaSource()
    return ConcatenatingMediaSource2.Builder()
      .setMediaItem(mediaItem)
      .add(silence)
      .build()
  }

  private fun ensureNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val nm = getSystemService(NotificationManager::class.java)
      if (nm.getNotificationChannel(PLACEHOLDER_CHANNEL_ID) == null) {
        val channel = NotificationChannel(
          PLACEHOLDER_CHANNEL_ID,
          "Now Playing",
          NotificationManager.IMPORTANCE_LOW
        ).apply { setShowBadge(false) }
        nm.createNotificationChannel(channel)
      }
    }
  }

  private fun makeActionIntent(action: String): PendingIntent {
    val i = Intent(this, NowPlayingService::class.java).apply { this.action = action }
    return PendingIntent.getService(
      this, action.hashCode(), i,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
  }

  private fun showNotification() {
    val session = mediaSession ?: return
    val exo = exoPlayer
    val metadata = exo?.mediaMetadata
    val isPlaying = exo?.isPlaying ?: false

    val compatToken = android.support.v4.media.session.MediaSessionCompat.Token
      .fromToken(session.platformToken)
    val mediaStyle = androidx.media.app.NotificationCompat.MediaStyle()
      .setMediaSession(compatToken)
      .setShowActionsInCompactView(0, 1, 2)

    val notification = NotificationCompat.Builder(this, PLACEHOLDER_CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_media_play)
      .setContentTitle(metadata?.title?.toString() ?: "")
      .setContentText(metadata?.artist?.toString() ?: "")
      .addAction(android.R.drawable.ic_media_previous, "Previous", makeActionIntent(ACTION_PREV))
      .addAction(
        if (isPlaying) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
        if (isPlaying) "Pause" else "Play",
        makeActionIntent(if (isPlaying) ACTION_PAUSE else ACTION_PLAY)
      )
      .addAction(android.R.drawable.ic_media_next, "Next", makeActionIntent(ACTION_NEXT))
      .setStyle(mediaStyle)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(isPlaying)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        PLACEHOLDER_NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
      )
    } else {
      startForeground(PLACEHOLDER_NOTIFICATION_ID, notification)
    }
  }

}
