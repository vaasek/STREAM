package local.streamon

import android.app.Application
import io.github.crow_misia.mediasoup.MediasoupClient
import io.github.crow_misia.webrtc.log.DefaultLogHandler

class App : Application() {
    var engine: RoomEngine? = null

    fun ensureWebRtc() {
        if (webrtcReady) return
        synchronized(App::class.java) {
            if (webrtcReady) return
            MediasoupClient.initialize(this, DefaultLogHandler)
            webrtcReady = true
        }
    }

    companion object {
        @Volatile
        var webrtcReady: Boolean = false
    }
}
