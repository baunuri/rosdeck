package expo.modules.binarywebsocket

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.typedarray.Uint8Array
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import okio.ByteString.Companion.toByteString
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/**
 * WebSocket whose binary frames reach JS as a Uint8Array (one copy) instead of
 * React Native's base64 strings. Binary frames queue here; JS gets one "onBinary"
 * ping per batch and pulls everything with drain(). Text frames go straight out as
 * events. Uses OkHttp, so TLS/proxy/user-CA behaviour matches React Native's socket.
 */
class ExpoBinaryWebSocketModule : Module() {
  private val client by lazy {
    OkHttpClient.Builder().readTimeout(0, TimeUnit.MILLISECONDS).build()
  }

  private class Connection {
    lateinit var socket: WebSocket
    val inbox = ConcurrentLinkedQueue<ByteArray>()
    val notified = AtomicBoolean(false)
  }

  private val connections = ConcurrentHashMap<Int, Connection>()
  private val nextId = AtomicInteger(1)

  override fun definition() = ModuleDefinition {
    Name("ExpoBinaryWebSocket")
    Events("onOpen", "onText", "onBinary", "onError", "onClose")

    Function("connect") { url: String, protocols: List<String> ->
      val id = nextId.getAndIncrement()
      val connection = Connection()
      connections[id] = connection // registered before OkHttp can call back
      val request = Request.Builder().url(url).apply {
        if (protocols.isNotEmpty()) header("Sec-WebSocket-Protocol", protocols.joinToString(", "))
      }.build()
      connection.socket = client.newWebSocket(request, Listener(id))
      id
    }

    Function("send") { id: Int, text: String ->
      connections[id]?.socket?.send(text) ?: false
    }

    // Function (not AsyncFunction): runs on the JS thread, where reading JS memory is safe.
    Function("sendBinary") { id: Int, data: Uint8Array ->
      val bytes = ByteArray(data.byteLength)
      data.read(bytes, 0, bytes.size)
      connections[id]?.socket?.send(bytes.toByteString()) ?: false
    }

    Function("close") { id: Int, code: Int, reason: String ->
      connections[id]?.socket?.close(code, reason)
    }

    // Every queued binary frame, packed as [u32 LE length][bytes]... into one buffer.
    Function("drain") { id: Int ->
      val connection = connections[id] ?: return@Function ByteArray(0)
      connection.notified.set(false) // frames arriving from here on trigger a new ping
      val frames = ArrayList<ByteArray>()
      while (true) frames.add(connection.inbox.poll() ?: break)
      val packed = ByteBuffer.allocate(frames.sumOf { 4 + it.size }).order(ByteOrder.LITTLE_ENDIAN)
      for (frame in frames) packed.putInt(frame.size).put(frame)
      packed.array()
    }

    OnDestroy {
      connections.values.forEach { it.socket.cancel() }
      connections.clear()
    }
  }

  private inner class Listener(private val id: Int) : WebSocketListener() {
    override fun onOpen(webSocket: WebSocket, response: Response) {
      sendEvent("onOpen", mapOf("id" to id, "protocol" to (response.header("Sec-WebSocket-Protocol") ?: "")))
    }

    // ponytail: text and binary travel separately, so a text frame can overtake queued binary
    // frames. Fine for Foxglove (data only flows after the client handles advertise/subscribe).
    override fun onMessage(webSocket: WebSocket, text: String) {
      sendEvent("onText", mapOf("id" to id, "data" to text))
    }

    override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
      val connection = connections[id] ?: return
      connection.inbox.add(bytes.toByteArray())
      if (connection.notified.compareAndSet(false, true)) sendEvent("onBinary", mapOf("id" to id))
    }

    override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
      webSocket.close(code, reason)
    }

    override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
      connections.remove(id)
      sendEvent("onClose", mapOf("id" to id, "code" to code, "reason" to reason))
    }

    override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
      connections.remove(id)
      val message = t.message ?: "WebSocket error"
      sendEvent("onError", mapOf("id" to id, "message" to message))
      sendEvent("onClose", mapOf("id" to id, "code" to 1006, "reason" to message))
    }
  }
}
