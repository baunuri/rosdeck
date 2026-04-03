package expo.modules.gamepad

import android.view.InputDevice
import android.view.MotionEvent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoGamepadModule : Module() {
  private var lastEmitTime = 0L
  private val throttleMs = 33L // ~30Hz

  override fun definition() = ModuleDefinition {
    Name("ExpoGamepad")

    Events("onGamepadAxis", "onGamepadConnection")

    OnCreate {
      instance = this@ExpoGamepadModule
      // Check for already-connected gamepads
      val deviceIds = InputDevice.getDeviceIds()
      for (id in deviceIds) {
        val device = InputDevice.getDevice(id) ?: continue
        if (device.sources and InputDevice.SOURCE_JOYSTICK == InputDevice.SOURCE_JOYSTICK) {
          sendEvent("onGamepadConnection", mapOf(
            "connected" to true,
            "name" to (device.name ?: "Unknown")
          ))
          break
        }
      }
    }

    OnDestroy {
      instance = null
    }
  }

  private fun processMotionEvent(event: MotionEvent): Boolean {
    if (event.source and InputDevice.SOURCE_JOYSTICK != InputDevice.SOURCE_JOYSTICK) return false

    val now = System.currentTimeMillis()
    if (now - lastEmitTime < throttleMs) return true
    lastEmitTime = now

    sendEvent("onGamepadAxis", mapOf(
      "leftX" to event.getAxisValue(MotionEvent.AXIS_X).toDouble(),
      "leftY" to event.getAxisValue(MotionEvent.AXIS_Y).toDouble(),
      "rightX" to event.getAxisValue(MotionEvent.AXIS_Z).toDouble(),
      "rightY" to event.getAxisValue(MotionEvent.AXIS_RZ).toDouble(),
    ))
    return true
  }

  companion object {
    private var instance: ExpoGamepadModule? = null

    /** Called from MainActivity.dispatchGenericMotionEvent via config plugin */
    @JvmStatic
    fun handleMotionEvent(event: MotionEvent): Boolean {
      return instance?.processMotionEvent(event) ?: false
    }
  }
}
