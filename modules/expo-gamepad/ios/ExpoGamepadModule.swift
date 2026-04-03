import ExpoModulesCore
import GameController

public class ExpoGamepadModule: Module {
  private var lastEmitTime: TimeInterval = 0
  private let throttleInterval: TimeInterval = 1.0 / 30.0
  private var leftX: Float = 0, leftY: Float = 0
  private var rightX: Float = 0, rightY: Float = 0

  public func definition() -> ModuleDefinition {
    Name("ExpoGamepad")

    Events("onGamepadAxis", "onGamepadConnection")

    OnCreate {
      NotificationCenter.default.addObserver(
        forName: .GCControllerDidConnect,
        object: nil, queue: .main
      ) { [weak self] notification in
        guard let controller = notification.object as? GCController else { return }
        self?.setupController(controller)
        self?.sendEvent("onGamepadConnection", [
          "connected": true,
          "name": controller.vendorName ?? "Unknown"
        ])
      }

      NotificationCenter.default.addObserver(
        forName: .GCControllerDidDisconnect,
        object: nil, queue: .main
      ) { [weak self] _ in
        self?.leftX = 0; self?.leftY = 0
        self?.rightX = 0; self?.rightY = 0
        self?.sendEvent("onGamepadConnection", [
          "connected": false,
          "name": ""
        ])
      }

      // Check for already-connected controllers
      if let controller = GCController.controllers().first {
        setupController(controller)
        sendEvent("onGamepadConnection", [
          "connected": true,
          "name": controller.vendorName ?? "Unknown"
        ])
      }
    }

    OnDestroy {
      NotificationCenter.default.removeObserver(self)
    }
  }

  private func setupController(_ controller: GCController) {
    guard let gamepad = controller.extendedGamepad else { return }

    gamepad.leftThumbstick.valueChangedHandler = { [weak self] _, xValue, yValue in
      self?.leftX = xValue
      self?.leftY = yValue
      self?.emitThrottled()
    }

    gamepad.rightThumbstick.valueChangedHandler = { [weak self] _, xValue, yValue in
      self?.rightX = xValue
      self?.rightY = yValue
      self?.emitThrottled()
    }
  }

  private func emitThrottled() {
    let now = ProcessInfo.processInfo.systemUptime
    guard now - lastEmitTime >= throttleInterval else { return }
    lastEmitTime = now

    sendEvent("onGamepadAxis", [
      "leftX": Double(leftX),
      "leftY": Double(leftY),
      "rightX": Double(rightX),
      "rightY": Double(rightY),
    ])
  }
}
