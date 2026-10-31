package local.streamon

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.media.projection.MediaProjection
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import io.github.crow_misia.mediasoup.Consumer
import io.github.crow_misia.mediasoup.Device
import io.github.crow_misia.mediasoup.Producer
import io.github.crow_misia.mediasoup.RecvTransport
import io.github.crow_misia.mediasoup.SendTransport
import io.github.crow_misia.mediasoup.Transport
import io.github.crow_misia.mediasoup.createDevice
import io.socket.client.Ack
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONArray
import org.json.JSONObject
import androidx.core.content.ContextCompat
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.MediaConstraints
import org.webrtc.PeerConnectionFactory
import org.webrtc.ScreenCapturerAndroid
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoSource
import org.webrtc.VideoTrack
import org.webrtc.audio.JavaAudioDeviceModule
import java.io.IOException
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.max
import kotlin.math.min

data class Tile(val id: String, val name: String, val track: VideoTrack)

class RoomEngine(
    private val app: Context,
    private val baseUrl: String,
    val roomCode: String,
    private val password: String,
    private val token: String,
    private val displayName: String,
) {
    private val thread = HandlerThread("streamon").apply { start() }
    private val handler = Handler(thread.looper)
    private val main = Handler(Looper.getMainLooper())
    private val tiles = LinkedHashMap<String, Tile>()
    private val consumers = mutableListOf<Consumer>()
    private val consumedIds = HashSet<String>()
    private val listeners = LinkedHashSet<() -> Unit>()

    @Volatile var status: String = "Подключение"
    @Volatile var sharing: Boolean = false
    @Volatile private var closed = false
    @Volatile private var joining = false
    private val stopping = AtomicBoolean(false)

    private var socket: Socket? = null
    private var egl: EglBase? = null
    private var factory: PeerConnectionFactory? = null
    private var device: Device? = null
    private var sendTransport: SendTransport? = null
    private var recvTransport: RecvTransport? = null
    private var capturer: ScreenCapturerAndroid? = null
    private var helper: SurfaceTextureHelper? = null
    private var videoSource: VideoSource? = null
    private var screenProducer: Producer? = null
    private var micProducer: Producer? = null
    private var micSource: AudioSource? = null
    private var micTrack: AudioTrack? = null
    private var audioDevice: JavaAudioDeviceModule? = null
    private var pendingCapture: Pair<Int, Intent>? = null

    fun eglContext(): EglBase.Context? = egl?.eglBaseContext

    fun tiles(): List<Tile> = synchronized(tiles) { tiles.values.toList() }

    fun addListener(listener: () -> Unit) {
        synchronized(listeners) { listeners.add(listener) }
    }

    fun removeListener(listener: () -> Unit) {
        synchronized(listeners) { listeners.remove(listener) }
    }

    fun start() {
        handler.post {
            try {
                if (factory == null) createFactory()
                connectSocket()
            } catch (error: Exception) {
                status = error.message ?: "Ошибка запуска"
                notifyUi()
            }
        }
    }

    fun startScreen(resultCode: Int, data: Intent) {
        val copy = Intent(data)
        handler.post {
            if (recvTransport == null) {
                pendingCapture = resultCode to copy
                status = "Подключаемся, экран включится следом"
                notifyUi()
                return@post
            }
            beginCapture(copy)
        }
    }

    fun stopScreen() {
        handler.post { releaseCapture(tellServer = true) }
    }

    fun enableMicrophone() {
        handler.post { if (!closed) startMicrophone() }
    }

    fun close() {
        if (!stopping.compareAndSet(false, true)) return
        closed = true
        handler.post {
            releaseCapture(tellServer = false)
            clearTilesAndWait()
            disposeSession()
            socket?.off()
            socket?.disconnect()
            socket = null
            try { micProducer?.close() } catch (_: Exception) {}
            micProducer = null
            try { micTrack?.dispose() } catch (_: Exception) {}
            micTrack = null
            try { micSource?.dispose() } catch (_: Exception) {}
            micSource = null
            try { factory?.dispose() } catch (_: Exception) {}
            factory = null
            try { audioDevice?.release() } catch (_: Exception) {}
            audioDevice = null
            try { egl?.release() } catch (_: Exception) {}
            egl = null
            restoreAudioRoute()
            thread.quitSafely()
        }
    }

    private fun createFactory() {
        (app.applicationContext as App).ensureWebRtc()
        val base = EglBase.create()
        egl = base
        val context = base.eglBaseContext
        val module = JavaAudioDeviceModule.builder(app)
            .setUseHardwareAcousticEchoCanceler(true)
            .setUseHardwareNoiseSuppressor(true)
            .createAudioDeviceModule()
        audioDevice = module
        factory = PeerConnectionFactory.builder()
            .setAudioDeviceModule(module)
            .setVideoEncoderFactory(DefaultVideoEncoderFactory(context, true, true))
            .setVideoDecoderFactory(DefaultVideoDecoderFactory(context))
            .createPeerConnectionFactory()
        routeSpeaker()
    }

    private fun routeSpeaker() {
        val manager = app.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        manager.mode = AudioManager.MODE_IN_COMMUNICATION
        if (Build.VERSION.SDK_INT >= 31) {
            val speaker = manager.availableCommunicationDevices.firstOrNull {
                it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
            }
            if (speaker != null) manager.setCommunicationDevice(speaker)
        }
        @Suppress("DEPRECATION")
        manager.isSpeakerphoneOn = true
    }

    private fun restoreAudioRoute() {
        val manager = app.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        if (Build.VERSION.SDK_INT >= 31) manager.clearCommunicationDevice()
        @Suppress("DEPRECATION")
        manager.isSpeakerphoneOn = false
        manager.mode = AudioManager.MODE_NORMAL
    }

    private fun connectSocket() {
        val options = IO.Options().apply {
            auth = mapOf("token" to token)
            reconnection = true
            timeout = 20_000
            forceNew = true
        }
        val client = IO.socket(baseUrl, options)
        socket = client
        client.on(Socket.EVENT_CONNECT) {
            handler.post { if (!closed) joinSession() }
        }
        client.on(Socket.EVENT_CONNECT_ERROR) { args ->
            status = args.firstOrNull()?.toString() ?: "Нет связи с сервером"
            notifyUi()
        }
        client.on("newProducer") { args ->
            val payload = args.firstOrNull() as? JSONObject ?: return@on
            handler.post {
                try {
                    consume(payload)
                } catch (error: Exception) {
                    status = error.message ?: "Не удалось принять экран"
                    notifyUi()
                }
            }
        }
        client.on("producerClosed") { args ->
            val id = (args.firstOrNull() as? JSONObject)?.optString("producerId").orEmpty()
            if (id.isBlank()) return@on
            handler.post {
                synchronized(tiles) { tiles.remove(id) }
                notifyUi()
            }
        }
        client.on("kicked") { args ->
            status = (args.firstOrNull() as? JSONObject)?.optString("reason") ?: "Вас исключили"
            notifyUi()
            close()
        }
        client.on("roomClosed") {
            status = "Комната завершена"
            notifyUi()
            close()
        }
        client.connect()
    }

    private fun joinSession() {
        if (joining || closed) return
        joining = true
        val wasSharing = sharing
        try {
            releaseCapture(tellServer = false)
            clearTilesAndWait()
            disposeSession()
            val current = factory ?: return
            val caps = request("rtpCapabilities", JSONObject().put("roomCode", roomCode))
            val loaded = current.createDevice()
            device = loaded
            loaded.load(jsonString(caps.get("rtpCapabilities")))
            val joined = request(
                "joinRoom",
                JSONObject()
                    .put("roomCode", roomCode)
                    .put("password", password)
                    .put("displayName", displayName)
                    .put("rtpCapabilities", JSONObject(loaded.rtpCapabilities)),
            )
            recvTransport = openRecv()
            val producers = joined.optJSONArray("producers") ?: JSONArray()
            for (index in 0 until producers.length()) {
                try {
                    consume(producers.getJSONObject(index))
                } catch (_: Exception) {
                }
            }
            status = if (wasSharing) "Связь есть. Включите трансляцию экрана ещё раз" else "В комнате $roomCode"
            try {
                startMicrophone()
            } catch (_: Exception) {
            }
            notifyUi()
            pendingCapture?.let { (_, data) ->
                pendingCapture = null
                beginCapture(data)
            }
        } catch (error: Exception) {
            status = error.message ?: "Не удалось войти в комнату"
            notifyUi()
        } finally {
            joining = false
        }
    }

    private fun openRecv(): RecvTransport {
        val info = request("createTransport", JSONObject().put("direction", "recv"))
        val loaded = device ?: throw IOException("Медиа не готово")
        return loaded.createRecvTransport(
            recvListener,
            info.getString("id"),
            jsonString(info.get("iceParameters")),
            jsonString(info.get("iceCandidates")),
            jsonString(info.get("dtlsParameters")),
        )
    }

    private fun openSend(): SendTransport {
        val info = request("createTransport", JSONObject().put("direction", "send"))
        val loaded = device ?: throw IOException("Медиа не готово")
        return loaded.createSendTransport(
            sendListener,
            info.getString("id"),
            jsonString(info.get("iceParameters")),
            jsonString(info.get("iceCandidates")),
            jsonString(info.get("dtlsParameters")),
        )
    }

    private val recvListener = object : RecvTransport.Listener {
        override fun onConnect(transport: Transport, dtlsParameters: String) {
            request(
                "connectTransport",
                JSONObject().put("transportId", transport.id).put("dtlsParameters", JSONObject(dtlsParameters)),
            )
        }

        override fun onConnectionStateChange(transport: Transport, newState: String) {
            if (newState.contains("failed")) {
                status = "Нет медиасвязи"
                notifyUi()
            }
        }
    }

    private val sendListener = object : SendTransport.Listener {
        override fun onConnect(transport: Transport, dtlsParameters: String) {
            request(
                "connectTransport",
                JSONObject().put("transportId", transport.id).put("dtlsParameters", JSONObject(dtlsParameters)),
            )
        }

        override fun onConnectionStateChange(transport: Transport, newState: String) {
            if (newState.contains("failed")) {
                status = "Нет медиасвязи"
                notifyUi()
            }
        }

        override fun onProduce(transport: Transport, kind: String, rtpParameters: String, appData: String?): String {
            val source = try {
                JSONObject(appData ?: "{}").optString("source").ifBlank { "screen" }
            } catch (_: Exception) {
                "screen"
            }
            val response = request(
                "produce",
                JSONObject()
                    .put("transportId", transport.id)
                    .put("kind", kind)
                    .put("rtpParameters", JSONObject(rtpParameters))
                    .put("appData", JSONObject().put("source", source)),
            )
            return response.getString("id")
        }

        override fun onProduceData(
            transport: Transport,
            sctpStreamParameters: String,
            label: String,
            protocol: String,
            appData: String?,
        ): String = ""
    }

    private val producerListener = object : Producer.Listener {
        override fun onTransportClose(producer: Producer) {
            sharing = false
            notifyUi()
        }
    }

    private fun beginCapture(data: Intent) {
        if (closed) return
        try {
            captureScreen(data)
        } catch (error: Exception) {
            try { releaseCapture(tellServer = false) } catch (_: Exception) {}
            sharing = false
            status = error.message ?: "Не удалось включить экран"
            notifyUi()
        }
    }

    private fun captureScreen(data: Intent) {
        releaseCapture(tellServer = true)
        val currentFactory = factory ?: return
        val context = egl?.eglBaseContext ?: return
        if (sendTransport == null) sendTransport = openSend()
        val texture = SurfaceTextureHelper.create("screen", context)
        helper = texture
        val source = currentFactory.createVideoSource(true)
        videoSource = source
        val screen = ScreenCapturerAndroid(data, object : MediaProjection.Callback() {
            override fun onStop() {
                handler.post { releaseCapture(tellServer = true) }
            }
        })
        capturer = screen
        screen.initialize(texture, app, source.capturerObserver)
        val metrics = app.resources.displayMetrics
        val scale = min(1f, min(1280f / metrics.widthPixels, 720f / metrics.heightPixels))
        val width = align((metrics.widthPixels * scale).toInt())
        val height = align((metrics.heightPixels * scale).toInt())
        screen.startCapture(width, height, 15)
        val track = currentFactory.createVideoTrack("screen", source)
        track.setEnabled(true)
        screenProducer = sendTransport?.produce(
            producerListener,
            track,
            emptyList<org.webrtc.RtpParameters.Encoding>(),
            null,
            null,
            """{"source":"screen"}""",
        )
        sharing = true
        status = "Экран в эфире"
        notifyUi()
    }

    private fun releaseCapture(tellServer: Boolean) {
        val id = screenProducer?.id
        try { capturer?.stopCapture() } catch (_: Exception) {}
        try { capturer?.dispose() } catch (_: Exception) {}
        capturer = null
        try { videoSource?.dispose() } catch (_: Exception) {}
        videoSource = null
        try { helper?.dispose() } catch (_: Exception) {}
        helper = null
        try { screenProducer?.close() } catch (_: Exception) {}
        screenProducer = null
        sharing = false
        if (tellServer && !id.isNullOrBlank()) {
            try {
                request("closeProducer", JSONObject().put("producerId", id))
            } catch (_: Exception) {}
        }
        notifyUi()
    }

    private fun startMicrophone() {
        if (closed || micProducer != null || recvTransport == null) return
        if (ContextCompat.checkSelfPermission(app, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) return
        val currentFactory = factory ?: return
        if (sendTransport == null) sendTransport = openSend()
        val source = currentFactory.createAudioSource(MediaConstraints())
        val track = currentFactory.createAudioTrack("mic", source)
        track.setEnabled(true)
        micSource = source
        micTrack = track
        micProducer = sendTransport?.produce(
            producerListener,
            track,
            emptyList<org.webrtc.RtpParameters.Encoding>(),
            null,
            null,
            """{"source":"mic"}""",
        )
        routeSpeaker()
    }

    private fun consume(meta: JSONObject) {
        val producerId = meta.getString("producerId")
        if (!consumedIds.add(producerId)) return
        val transport = recvTransport ?: return
        val loaded = device ?: return
        val params = request(
            "consume",
            JSONObject()
                .put("transportId", transport.id)
                .put("producerId", producerId)
                .put("rtpCapabilities", JSONObject(loaded.rtpCapabilities)),
        )
        val consumer = transport.consume(
            object : Consumer.Listener {
                override fun onTransportClose(consumer: Consumer) {}
            },
            params.getString("id"),
            params.getString("producerId"),
            params.getString("kind"),
            jsonString(params.get("rtpParameters")),
        )
        consumer.resume()
        request("resumeConsumer", JSONObject().put("consumerId", consumer.id))
        consumers.add(consumer)
        val track = consumer.track
        if (track is VideoTrack) {
            synchronized(tiles) {
                tiles[producerId] = Tile(producerId, meta.optString("peerName", "Экран"), track)
            }
            notifyUi()
        } else if (track is AudioTrack) {
            track.setEnabled(true)
            routeSpeaker()
        }
    }

    private fun disposeSession() {
        consumers.forEach { try { it.close() } catch (_: Exception) {} }
        consumers.clear()
        consumedIds.clear()
        micProducer = null
        try { micTrack?.dispose() } catch (_: Exception) {}
        micTrack = null
        try { micSource?.dispose() } catch (_: Exception) {}
        micSource = null
        try { sendTransport?.close(); sendTransport?.dispose() } catch (_: Exception) {}
        try { recvTransport?.close(); recvTransport?.dispose() } catch (_: Exception) {}
        sendTransport = null
        recvTransport = null
        try { device?.dispose() } catch (_: Exception) {}
        device = null
    }

    private fun clearTilesAndWait() {
        synchronized(tiles) { tiles.clear() }
        val latch = CountDownLatch(1)
        main.post {
            notifyListeners()
            latch.countDown()
        }
        latch.await(2, TimeUnit.SECONDS)
    }

    private fun request(event: String, payload: JSONObject): JSONObject {
        val client = socket ?: throw IOException("Нет связи с сервером")
        val latch = CountDownLatch(1)
        var body: JSONObject? = null
        val ack = Ack { args ->
            body = args.firstOrNull() as? JSONObject ?: JSONObject().put("error", "Пустой ответ")
            latch.countDown()
        }
        client.emit(event, payload, ack)
        if (!latch.await(20, TimeUnit.SECONDS)) throw IOException("Сервер не ответил")
        val result = body ?: throw IOException("Пустой ответ")
        if (result.has("error") && result.optString("error").isNotBlank()) {
            throw IOException(result.getString("error"))
        }
        return result
    }

    private fun notifyUi() {
        main.post { notifyListeners() }
    }

    private fun notifyListeners() {
        val copy = synchronized(listeners) { listeners.toList() }
        copy.forEach { it.invoke() }
    }

    private fun align(value: Int): Int = max(16, value / 16 * 16)

    private fun jsonString(value: Any?): String = when (value) {
        null -> "null"
        is String -> value
        is JSONObject -> value.toString()
        is JSONArray -> value.toString()
        else -> value.toString()
    }
}
