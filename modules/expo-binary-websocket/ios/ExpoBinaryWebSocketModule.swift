import ExpoModulesCore
import Foundation

/**
 WebSocket whose binary frames reach JS as a Uint8Array (one copy) instead of React
 Native's base64 strings. Same contract as the Android module: binary frames queue
 here, JS gets one "onBinary" ping per batch and pulls everything with drain();
 text frames go straight out as events. Uses URLSessionWebSocketTask, so TLS and
 proxy behaviour follows the system (as React Native's own socket does).
 */
public class ExpoBinaryWebSocketModule: Module {
  private final class Connection {
    let task: URLSessionWebSocketTask
    private let lock = NSLock()
    private var inbox: [Data] = []
    private var notified = false
    var closed = false

    init(task: URLSessionWebSocketTask) { self.task = task }

    /// Queues a frame; true when JS needs a ping (first frame since the last drain).
    func enqueue(_ data: Data) -> Bool {
      lock.lock(); defer { lock.unlock() }
      inbox.append(data)
      if notified { return false }
      notified = true
      return true
    }

    func drainAll() -> [Data] {
      lock.lock(); defer { lock.unlock() }
      notified = false // frames arriving from here on trigger a new ping
      let frames = inbox
      inbox.removeAll(keepingCapacity: true)
      return frames
    }
  }

  private let lock = NSLock()
  private var connections: [Int: Connection] = [:]
  private var nextId = 1
  private lazy var delegate = Delegate(module: self)
  private lazy var session = URLSession(configuration: .default, delegate: delegate, delegateQueue: nil)

  private func connection(_ id: Int) -> Connection? {
    lock.lock(); defer { lock.unlock() }
    return connections[id]
  }

  private func remove(_ id: Int) -> Connection? {
    lock.lock(); defer { lock.unlock() }
    return connections.removeValue(forKey: id)
  }

  public func definition() -> ModuleDefinition {
    Name("ExpoBinaryWebSocket")
    Events("onOpen", "onText", "onBinary", "onError", "onClose")

    Function("connect") { (url: String, protocols: [String]) -> Int in
      guard let target = URL(string: url) else {
        throw Exception(name: "InvalidURL", description: "Invalid WebSocket URL: \(url)")
      }
      let task = self.session.webSocketTask(with: target, protocols: protocols)
      task.maximumMessageSize = 64 * 1024 * 1024 // default is 1 MB; point clouds are bigger
      self.lock.lock()
      let id = self.nextId
      self.nextId += 1
      self.connections[id] = Connection(task: task) // registered before any callback can fire
      self.lock.unlock()
      task.taskDescription = String(id)
      self.receive(id)
      task.resume()
      return id
    }

    Function("send") { (id: Int, text: String) -> Bool in
      guard let c = self.connection(id) else { return false }
      c.task.send(.string(text)) { error in if let error { self.fail(id, error) } }
      return true
    }

    // Function (not AsyncFunction): runs on the JS thread; Data arrives as a copy of the Uint8Array.
    Function("sendBinary") { (id: Int, data: Data) -> Bool in
      guard let c = self.connection(id) else { return false }
      c.task.send(.data(data)) { error in if let error { self.fail(id, error) } }
      return true
    }

    Function("close") { (id: Int, code: Int, reason: String) in
      guard let c = self.connection(id) else { return }
      let closeCode = URLSessionWebSocketTask.CloseCode(rawValue: code) ?? .normalClosure
      c.task.cancel(with: closeCode, reason: reason.data(using: .utf8))
    }

    // Every queued binary frame, packed as [u32 LE length][bytes]... into one buffer.
    Function("drain") { (id: Int) -> Data in
      guard let c = self.connection(id) else { return Data() }
      let frames = c.drainAll()
      var packed = Data(capacity: frames.reduce(0) { $0 + 4 + $1.count })
      for frame in frames {
        var length = UInt32(frame.count).littleEndian
        withUnsafeBytes(of: &length) { packed.append(contentsOf: $0) }
        packed.append(frame)
      }
      return packed
    }

    OnDestroy {
      self.lock.lock()
      let all = self.connections.values
      self.connections.removeAll()
      self.lock.unlock()
      all.forEach { $0.task.cancel(with: .goingAway, reason: nil) }
    }
  }

  /// URLSessionWebSocketTask delivers one message per receive() call; re-arm after each.
  private func receive(_ id: Int) {
    guard let c = connection(id) else { return }
    c.task.receive { [weak self] result in
      guard let self else { return }
      switch result {
      case .success(.data(let data)):
        if let c = self.connection(id), c.enqueue(data) {
          self.sendEvent("onBinary", ["id": id])
        }
        self.receive(id)
      case .success(.string(let text)):
        self.sendEvent("onText", ["id": id, "data": text])
        self.receive(id)
      case .success:
        self.receive(id)
      case .failure(let error):
        self.fail(id, error)
      }
    }
  }

  fileprivate func opened(_ id: Int, protocol proto: String?) {
    sendEvent("onOpen", ["id": id, "protocol": proto ?? ""])
  }

  fileprivate func closed(_ id: Int, code: Int, reason: String) {
    guard let c = remove(id), !c.closed else { return }
    c.closed = true
    sendEvent("onClose", ["id": id, "code": code, "reason": reason])
  }

  private func fail(_ id: Int, _ error: Error) {
    guard let c = remove(id), !c.closed else { return }
    c.closed = true
    c.task.cancel(with: .abnormalClosure, reason: nil)
    sendEvent("onError", ["id": id, "message": error.localizedDescription])
    sendEvent("onClose", ["id": id, "code": 1006, "reason": error.localizedDescription])
  }

  private final class Delegate: NSObject, URLSessionWebSocketDelegate {
    weak var module: ExpoBinaryWebSocketModule?
    init(module: ExpoBinaryWebSocketModule) { self.module = module }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol proto: String?) {
      guard let id = Int(webSocketTask.taskDescription ?? "") else { return }
      module?.opened(id, protocol: proto)
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask,
                    didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
      guard let id = Int(webSocketTask.taskDescription ?? "") else { return }
      module?.closed(id, code: closeCode.rawValue, reason: reason.flatMap { String(data: $0, encoding: .utf8) } ?? "")
    }
  }
}
