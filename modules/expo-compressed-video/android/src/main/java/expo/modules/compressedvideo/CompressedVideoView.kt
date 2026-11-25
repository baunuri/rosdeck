package expo.modules.compressedvideo

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.SurfaceTexture
import android.media.MediaCodec
import android.media.MediaFormat
import android.os.Handler
import android.os.HandlerThread
import android.util.Base64
import android.view.Surface
import android.view.TextureView
import android.view.ViewGroup
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import java.util.ArrayDeque

// Ported from the lifliu/rosdeck fork (GPL-3.0). Hardware-decodes Annex-B
// H.264/H.265/VP9/AV1 packets (foxglove_msgs/CompressedVideo) onto a TextureView.
@SuppressLint("ViewConstructor")
class CompressedVideoView(context: Context, appContext: AppContext) : ExpoView(context, appContext),
  TextureView.SurfaceTextureListener {
  private data class EncodedFrame(val bytes: ByteArray, val presentationTimeUs: Long)

  private val textureView = TextureView(context)
  private val decoderThread = HandlerThread("RosDeckVideoDecoder").apply { start() }
  private val decoderHandler = Handler(decoderThread.looper)
  private val pendingFrames = ArrayDeque<EncodedFrame>()
  private var surface: Surface? = null
  private var codec: MediaCodec? = null
  private var videoFormat = "h265"

  init {
    textureView.surfaceTextureListener = this
    addView(textureView, ViewGroup.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.MATCH_PARENT,
    ))
  }

  fun setFormat(format: String) {
    val normalized = format.lowercase()
    if (normalized == videoFormat) return
    videoFormat = normalized
    resetDecoder()
  }

  fun pushFrame(base64Data: String, presentationTimeUs: Long) {
    val bytes = try {
      Base64.decode(base64Data, Base64.NO_WRAP)
    } catch (_: IllegalArgumentException) {
      return
    }
    if (bytes.isEmpty()) return
    decoderHandler.post {
      // Keep latency bounded. If decoding falls behind, retain the newest GOP-sized window.
      while (pendingFrames.size >= 60) pendingFrames.removeFirst()
      pendingFrames.addLast(EncodedFrame(bytes, presentationTimeUs))
      decodePendingFrames()
    }
  }

  fun resetDecoder() {
    decoderHandler.post {
      pendingFrames.clear()
      releaseCodec()
      ensureCodec()
    }
  }

  /** Called once when React unmounts the view; the decoder thread is not reusable after this. */
  fun destroy() {
    decoderHandler.post {
      pendingFrames.clear()
      releaseCodec()
      surface?.release()
      surface = null
    }
    decoderThread.quitSafely()
  }

  private fun mimeType(): String = when (videoFormat) {
    "h264" -> MediaFormat.MIMETYPE_VIDEO_AVC
    "vp9" -> MediaFormat.MIMETYPE_VIDEO_VP9
    "av1" -> MediaFormat.MIMETYPE_VIDEO_AV1
    else -> MediaFormat.MIMETYPE_VIDEO_HEVC
  }

  private fun ensureCodec(): MediaCodec? {
    codec?.let { return it }
    val outputSurface = surface ?: return null
    return try {
      MediaCodec.createDecoderByType(mimeType()).also { decoder ->
        // Coded dimensions are updated from the parameter sets carried by keyframes.
        val mediaFormat = MediaFormat.createVideoFormat(mimeType(), 1920, 1080)
        decoder.configure(mediaFormat, outputSurface, null, 0)
        decoder.start()
        codec = decoder
      }
    } catch (_: Exception) {
      releaseCodec()
      null
    }
  }

  private fun decodePendingFrames() {
    val decoder = ensureCodec() ?: return
    try {
      while (pendingFrames.isNotEmpty()) {
        val inputIndex = decoder.dequeueInputBuffer(0)
        if (inputIndex < 0) break
        val frame = pendingFrames.removeFirst()
        val input = decoder.getInputBuffer(inputIndex) ?: continue
        input.clear()
        if (frame.bytes.size > input.remaining()) continue
        input.put(frame.bytes)
        decoder.queueInputBuffer(inputIndex, 0, frame.bytes.size, frame.presentationTimeUs, 0)
        drainOutput(decoder)
      }
      drainOutput(decoder)
      if (pendingFrames.isNotEmpty()) decoderHandler.postDelayed({ decodePendingFrames() }, 4)
    } catch (_: Exception) {
      releaseCodec()
      // Wait for a subsequent keyframe containing parameter sets to restart decoding.
    }
  }

  private fun drainOutput(decoder: MediaCodec) {
    val info = MediaCodec.BufferInfo()
    while (true) {
      val outputIndex = decoder.dequeueOutputBuffer(info, 0)
      if (outputIndex >= 0) {
        decoder.releaseOutputBuffer(outputIndex, true)
      } else if (outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
        continue
      } else {
        break
      }
    }
  }

  private fun releaseCodec() {
    codec?.let {
      try { it.stop() } catch (_: Exception) {}
      try { it.release() } catch (_: Exception) {}
    }
    codec = null
  }

  override fun onSurfaceTextureAvailable(texture: SurfaceTexture, width: Int, height: Int) {
    decoderHandler.post {
      surface?.release()
      surface = Surface(texture)
      ensureCodec()
      decodePendingFrames()
    }
  }

  override fun onSurfaceTextureSizeChanged(texture: SurfaceTexture, width: Int, height: Int) = Unit

  override fun onSurfaceTextureDestroyed(texture: SurfaceTexture): Boolean {
    // Fires on detach too; the view may be re-attached, so keep the thread alive.
    decoderHandler.post {
      pendingFrames.clear()
      releaseCodec()
      surface?.release()
      surface = null
    }
    return true
  }

  override fun onSurfaceTextureUpdated(texture: SurfaceTexture) = Unit
}
