package expo.modules.compressedvideo

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Ported from the lifliu/rosdeck fork (GPL-3.0).
class ExpoCompressedVideoModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoCompressedVideo")

    View(CompressedVideoView::class) {
      Prop("format") { view: CompressedVideoView, format: String ->
        view.setFormat(format)
      }

      // Base64 string, not Uint8Array: AsyncFunction bodies run off the JS thread,
      // and reading JS typed-array memory there crashes Hermes.
      AsyncFunction("pushFrame") { view: CompressedVideoView, data: String, presentationTimeUs: Double ->
        view.pushFrame(data, presentationTimeUs.toLong())
      }

      AsyncFunction("reset") { view: CompressedVideoView ->
        view.resetDecoder()
      }

      OnViewDestroys { view: CompressedVideoView ->
        view.destroy()
      }
    }
  }
}
