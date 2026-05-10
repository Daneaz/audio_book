package expo.modules.nowplaying

import android.os.Looper
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.common.SimpleBasePlayer
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

/**
 * Empty Player implementation. We only update its state from RN; play/pause/seekToNext/seekToPrevious
 * commands forward to the module via callbacks (no actual audio playback here).
 */
class PlayerStub(
  private val onPlay: () -> Unit,
  private val onPause: () -> Unit,
  private val onNext: () -> Unit,
  private val onPrevious: () -> Unit,
) : SimpleBasePlayer(Looper.getMainLooper()) {

  private var playWhenReady = false
  private var currentMediaItem: MediaItem = MediaItem.EMPTY

  fun setMetadata(title: String, subtitle: String, artworkUri: android.net.Uri?) {
    val metadata = MediaMetadata.Builder()
      .setTitle(title)
      .setArtist(subtitle)
      .apply { if (artworkUri != null) setArtworkUri(artworkUri) }
      .build()
    currentMediaItem = MediaItem.Builder()
      .setMediaId("now-playing")
      .setMediaMetadata(metadata)
      .build()
    invalidateState()
  }

  fun setIsPlaying(isPlaying: Boolean) {
    playWhenReady = isPlaying
    invalidateState()
  }

  override fun getState(): State {
    return State.Builder()
      .setAvailableCommands(
        Player.Commands.Builder()
          .add(Player.COMMAND_PLAY_PAUSE)
          .add(Player.COMMAND_SEEK_TO_NEXT)
          .add(Player.COMMAND_SEEK_TO_PREVIOUS)
          .build()
      )
      .setPlayWhenReady(playWhenReady, Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST)
      .setPlaybackState(Player.STATE_READY)
      .setPlaylist(
        listOf(
          MediaItemData.Builder("now-playing")
            .setMediaItem(currentMediaItem)
            .setIsSeekable(false)
            .setDurationUs(C.TIME_UNSET)
            .build()
        )
      )
      .build()
  }

  override fun handleSetPlayWhenReady(playWhenReady: Boolean): ListenableFuture<*> {
    if (playWhenReady) onPlay() else onPause()
    return Futures.immediateVoidFuture()
  }

  override fun handleSeek(mediaItemIndex: Int, positionMs: Long, seekCommand: Int): ListenableFuture<*> {
    when (seekCommand) {
      Player.COMMAND_SEEK_TO_NEXT, Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM -> onNext()
      Player.COMMAND_SEEK_TO_PREVIOUS, Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM -> onPrevious()
    }
    return Futures.immediateVoidFuture()
  }
}
