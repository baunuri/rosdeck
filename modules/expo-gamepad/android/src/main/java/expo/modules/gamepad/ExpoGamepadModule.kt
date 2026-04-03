package expo.modules.gamepad

import android.hardware.input.InputManager
import android.view.InputDevice
import android.view.MotionEvent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoGamepadModule : Module() {
  private var lastEmitTime = 0L
  private val throttleMs = 33L // ~30Hz
  private var connected = false
  private var inputListener: InputManager.InputDeviceListener? = null

  override fun definition() = ModuleDefinition {
    Name("ExpoGamepad")

    Events("onGamepadAxis", "onGamepadConnection")

    OnCreate {
      instance = this@ExpoGamepadModule

      // Register for dynamic device connect/disconnect
      val activity = appContext.currentActivity
      if (activity != null) {
        val inputManager = activity.getSystemService(InputManager::class.java)
        inputListener = object : InputManager.InputDeviceListener {
          override fun onInputDeviceAdded(deviceId: Int) {
            val device = InputDevice.getDevice(deviceId) ?: return
            if (isGamepad(device)) {
              connected = true
              sendEvent("onGamepadConnection", mapOf(
                "connected" to true,
                "name" to (device.name ?: "Unknown")
              ))
            }
          }
          override fun onInputDeviceRemoved(deviceId: Int) {
            // Check if any gamepads remain
            if (!hasConnectedGamepad()) {
              connected = false
              sendEvent("onGamepadConnection", mapOf(
                "connected" to false,
                "name" to ""
              ))
            }
          }
          override fun onInputDeviceChanged(deviceId: Int) {}
        }
        inputManager?.registerInputDeviceListener(inputListener, null)
      }

      // Don't send connection event here — JS listeners aren't registered yet.
      // The auto-connect in processMotionEvent will fire on first stick input.
    }

    OnDestroy {
      val activity = appContext.currentActivity
      if (activity != null && inputListener != null) {
        val inputManager = activity.getSystemService(InputManager::class.java)
        inputManager?.unregisterInputDeviceListener(inputListener)
      }
      inputListener = null
      instance = null
    }
  }

  private fun isGamepad(device: InputDevice): Boolean {
    val sources = device.sources
    return (sources and InputDevice.SOURCE_JOYSTICK == InputDevice.SOURCE_JOYSTICK) ||
           (sources and InputDevice.SOURCE_GAMEPAD == InputDevice.SOURCE_GAMEPAD)
  }

  private fun hasConnectedGamepad(): Boolean {
    return findFirstGamepad() != null
  }

  private fun findFirstGamepad(): InputDevice? {
    for (id in InputDevice.getDeviceIds()) {
      val device = InputDevice.getDevice(id) ?: continue
      if (isGamepad(device)) return device
    }
    return null
  }

  private fun processMotionEvent(event: MotionEvent): Boolean {
    val sources = event.source
    if (sources and InputDevice.SOURCE_JOYSTICK != InputDevice.SOURCE_JOYSTICK &&
        sources and InputDevice.SOURCE_GAMEPAD != InputDevice.SOURCE_GAMEPAD) return false

    // Auto-detect connection on first axis event if not already connected
    if (!connected) {
      connected = true
      val device = event.device
      sendEvent("onGamepadConnection", mapOf(
        "connected" to true,
        "name" to (device?.name ?: "Unknown")
      ))
    }

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

    @JvmStatic
    fun handleMotionEvent(event: MotionEvent): Boolean {
      return instance?.processMotionEvent(event) ?: false
    }
  }
}
