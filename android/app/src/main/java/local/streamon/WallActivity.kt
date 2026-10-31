package local.streamon

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.graphics.Outline
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewOutlineProvider
import android.widget.FrameLayout
import android.widget.GridLayout
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import local.streamon.databinding.ActivityWallBinding
import org.webrtc.RendererCommon
import org.webrtc.SurfaceViewRenderer
import org.webrtc.VideoTrack

class WallActivity : AppCompatActivity() {
    private lateinit var binding: ActivityWallBinding
    private var engine: RoomEngine? = null
    private val cells = LinkedHashMap<String, Cell>()
    private val render = { draw() }

    private val notifications = registerForActivityResult(ActivityResultContracts.RequestPermission()) {
        launchProjection()
    }
    private val projection = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val data = result.data
        if (result.resultCode != RESULT_OK || data == null) return@registerForActivityResult
        val intent = Intent(this, ScreenService::class.java)
            .putExtra(ScreenService.EXTRA_RESULT, result.resultCode)
            .putExtra(ScreenService.EXTRA_DATA, data)
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(intent) else startService(intent)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityWallBinding.inflate(layoutInflater)
        setContentView(binding.root)
        val prefs = Prefs(this)
        val code = intent.getStringExtra(EXTRA_CODE)?.ifBlank { null } ?: prefs.lastCode
        if (code.isBlank() || prefs.token.isBlank() || prefs.baseUrl.isBlank()) {
            startActivity(Intent(this, MainActivity::class.java))
            finish()
            return
        }
        val app = application as App
        val password = intent.getStringExtra(EXTRA_PASSWORD) ?: prefs.lastPassword
        val current = app.engine
        val session = if (current != null && current.roomCode == code) {
            current
        } else {
            current?.close()
            RoomEngine(
                applicationContext,
                prefs.baseUrl,
                code,
                password,
                prefs.token,
                "${prefs.name} · ${Build.MODEL}",
            ).also {
                app.engine = it
                it.start()
            }
        }
        engine = session
        binding.title.text = "Комната $code"
        binding.grid.columnCount = if (resources.configuration.smallestScreenWidthDp >= 600) 3 else 2
        binding.share.setOnClickListener {
            if (session.sharing) stopShare() else askShare()
        }
        binding.leave.setOnClickListener { leave() }
        session.addListener(render)
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            session.enableMicrophone()
        } else {
            micPermission.launch(Manifest.permission.RECORD_AUDIO)
        }
        draw()
    }

    private val micPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) engine?.enableMicrophone()
    }

    override fun onDestroy() {
        engine?.removeListener(render)
        if (isFinishing && engine?.sharing != true) {
            engine?.close()
            (application as App).engine = null
        }
        super.onDestroy()
    }

    private fun askShare() {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            notifications.launch(Manifest.permission.POST_NOTIFICATIONS)
            return
        }
        launchProjection()
    }

    private fun launchProjection() {
        val manager = getSystemService(MEDIA_PROJECTION_SERVICE) as android.media.projection.MediaProjectionManager
        projection.launch(manager.createScreenCaptureIntent())
    }

    private fun stopShare() {
        startService(Intent(this, ScreenService::class.java).setAction(ScreenService.ACTION_STOP))
    }

    private fun leave() {
        stopService(Intent(this, ScreenService::class.java))
        engine?.close()
        (application as App).engine = null
        engine = null
        finish()
    }

    private fun draw() {
        val session = engine ?: return
        if (isDestroyed) return
        binding.status.text = session.status
        if (session.sharing) {
            binding.share.text = "Остановить трансляцию"
            binding.share.backgroundTintList = ColorStateList.valueOf(ContextCompat.getColor(this, R.color.danger))
            binding.share.setTextColor(ContextCompat.getColor(this, R.color.ink))
        } else {
            binding.share.text = "Транслировать экран"
            binding.share.backgroundTintList = ColorStateList.valueOf(ContextCompat.getColor(this, R.color.mint))
            binding.share.setTextColor(ContextCompat.getColor(this, R.color.mint_ink))
        }
        val current = session.tiles()
        binding.empty.visibility = if (current.isEmpty()) View.VISIBLE else View.GONE
        val ids = current.map { it.id }.toSet()
        for (id in cells.keys.filter { it !in ids }) {
            val cell = cells.remove(id) ?: continue
            try { cell.track.removeSink(cell.renderer) } catch (_: Exception) {}
            cell.renderer.release()
            binding.grid.removeView(cell.root)
        }
        val egl = session.eglContext() ?: return
        for (tile in current) {
            if (cells.containsKey(tile.id)) continue
            val renderer = SurfaceViewRenderer(this)
            renderer.init(egl, null)
            renderer.setEnableHardwareScaler(true)
            renderer.setMirror(false)
            renderer.setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FIT)
            tile.track.addSink(renderer)
            val label = TextView(this).apply {
                text = tile.name
                setTextColor(0xFFE8EEF6.toInt())
                textSize = 12f
                maxLines = 1
                ellipsize = android.text.TextUtils.TruncateAt.END
                setBackgroundResource(R.drawable.bg_label)
                setPadding(dp(10), dp(8), dp(10), dp(8))
            }
            val radius = dp(18).toFloat()
            val root = FrameLayout(this)
            root.background = GradientDrawable().apply {
                cornerRadius = radius
                setColor(0xFF10161C.toInt())
            }
            root.outlineProvider = object : ViewOutlineProvider() {
                override fun getOutline(view: View, outline: Outline) {
                    outline.setRoundRect(0, 0, view.width, view.height, radius)
                }
            }
            root.clipToOutline = true
            root.addView(renderer, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
            root.addView(label, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM))
            val params = GridLayout.LayoutParams(
                GridLayout.spec(GridLayout.UNDEFINED),
                GridLayout.spec(GridLayout.UNDEFINED, 1f),
            )
            params.width = 0
            params.height = dp(210)
            params.setMargins(dp(5), dp(5), dp(5), dp(5))
            binding.grid.addView(root, params)
            cells[tile.id] = Cell(root, renderer, tile.track)
        }
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private data class Cell(val root: FrameLayout, val renderer: SurfaceViewRenderer, val track: VideoTrack)

    companion object {
        const val EXTRA_CODE = "code"
        const val EXTRA_PASSWORD = "password"
    }
}
