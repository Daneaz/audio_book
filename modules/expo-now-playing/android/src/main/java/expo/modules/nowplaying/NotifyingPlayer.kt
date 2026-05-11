package expo.modules.nowplaying

import androidx.media3.common.ForwardingPlayer
import androidx.media3.common.Player

/**
 * Wraps a real Player and intercepts transport commands that come from
 * notification / lock screen / Bluetooth, forwarding them to the RN module
 * via callbacks. Internal state changes (driven by the RN side) bypass this
 * wrapper by talking to the delegate ExoPlayer directly.
 */
class NotifyingPlayer(
  delegate: Player,
  private val onPlayCmd: () -> Unit,
  private val onPauseCmd: () -> Unit,
  private val onNextCmd: () -> Unit,
  private val onPreviousCmd: () -> Unit,
) : ForwardingPlayer(delegate) {

  override fun play() {
    onPlayCmd()
  }

  override fun pause() {
    onPauseCmd()
  }

  override fun seekToNext() {
    onNextCmd()
  }

  override fun seekToNextMediaItem() {
    onNextCmd()
  }

  override fun seekToPrevious() {
    onPreviousCmd()
  }

  override fun seekToPreviousMediaItem() {
    onPreviousCmd()
  }
}
