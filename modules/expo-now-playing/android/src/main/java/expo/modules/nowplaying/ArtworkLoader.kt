package expo.modules.nowplaying

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Handler
import android.os.Looper
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.IOException
import java.util.concurrent.atomic.AtomicReference

object ArtworkLoader {
  private val client = OkHttpClient()
  private val mainHandler = Handler(Looper.getMainLooper())
  private val currentToken = AtomicReference<String?>(null)

  fun load(uri: Uri?, onLoaded: (Bitmap?) -> Unit) {
    val token = uri?.toString()
    currentToken.set(token)
    if (uri == null) {
      mainHandler.post { onLoaded(null) }
      return
    }
    val scheme = uri.scheme ?: ""
    Thread {
      val bitmap = try {
        when (scheme) {
          "http", "https" -> {
            val req = Request.Builder().url(uri.toString()).build()
            client.newCall(req).execute().use { resp ->
              if (!resp.isSuccessful) null
              else resp.body?.byteStream()?.let { BitmapFactory.decodeStream(it) }
            }
          }
          "file", "" -> {
            val path = uri.path
            if (path != null) BitmapFactory.decodeFile(path) else null
          }
          else -> null
        }
      } catch (_: IOException) {
        null
      } catch (_: Exception) {
        null
      }
      if (currentToken.get() == token) {
        mainHandler.post { onLoaded(bitmap) }
      }
    }.start()
  }
}
