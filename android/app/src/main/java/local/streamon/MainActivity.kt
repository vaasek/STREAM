package local.streamon

import android.content.Intent
import android.os.Bundle
import android.text.InputType
import android.view.View
import android.widget.FrameLayout
import android.widget.GridLayout
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout
import local.streamon.databinding.ActivityMainBinding
import org.json.JSONObject
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding
    private lateinit var prefs: Prefs
    private val io = Executors.newSingleThreadExecutor()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        prefs = Prefs(this)
        if (binding.server.text.isNullOrBlank()) binding.server.setText(prefs.baseUrl.ifBlank { "http://192.168.0.10:8080" })
        binding.email.setText(prefs.email)
        binding.login.setOnClickListener { login() }
        binding.join.setOnClickListener { joinTyped() }
        binding.createWall.setOnClickListener { createWall() }
        binding.logout.setOnClickListener {
            prefs.clearSession()
            showRoom(false)
        }
        if (prefs.token.isNotBlank() && prefs.baseUrl.isNotBlank()) {
            showRoom(true)
            restore()
        }
    }

    override fun onDestroy() {
        io.shutdownNow()
        super.onDestroy()
    }

    private fun login() {
        val base = Api.normalize(binding.server.text?.toString().orEmpty())
        val email = binding.email.text?.toString().orEmpty().trim()
        val password = binding.password.text?.toString().orEmpty()
        if (base.isBlank() || email.isBlank() || password.isBlank()) {
            binding.loginError.text = "Нужны адрес сервера, почта и пароль"
            return
        }
        binding.login.isEnabled = false
        binding.loginError.text = ""
        io.execute {
            try {
                val api = Api(base)
                val data = api.login(email, password)
                val user = data.getJSONObject("user")
                prefs.baseUrl = api.base
                prefs.token = data.getString("token")
                prefs.email = email
                prefs.name = user.getString("name")
                runOnUiThread {
                    binding.password.setText("")
                    showRoom(true)
                    loadLive()
                }
            } catch (error: Exception) {
                runOnUiThread { binding.loginError.text = error.message ?: "Не удалось войти" }
            } finally {
                runOnUiThread { binding.login.isEnabled = true }
            }
        }
    }

    private fun restore() {
        io.execute {
            try {
                val user = Api(prefs.baseUrl).me(prefs.token)
                prefs.name = user.optString("name", prefs.name)
                runOnUiThread {
                    binding.server.setText(prefs.baseUrl)
                    showRoom(true)
                    loadLive()
                }
            } catch (_: Exception) {
                prefs.clearSession()
                runOnUiThread { showRoom(false) }
            }
        }
    }

    private fun showRoom(visible: Boolean) {
        binding.loginBlock.visibility = if (visible) View.GONE else View.VISIBLE
        binding.roomBlock.visibility = if (visible) View.VISIBLE else View.GONE
        binding.logout.visibility = if (visible) View.VISIBLE else View.GONE
        binding.who.text = if (prefs.name.isBlank()) "Комнаты" else "Здравствуйте, ${prefs.name}"
        if (binding.code.text.isNullOrBlank()) binding.code.setText(prefs.lastCode)
    }

    private fun loadLive() {
        io.execute {
            try {
                val rooms = Api(prefs.baseUrl).live(prefs.token)
                runOnUiThread {
                    binding.live.removeAllViews()
                    if (rooms.length() == 0) {
                        val empty = TextView(this).apply {
                            text = "Сейчас нет живых комнат"
                            setTextColor(0xFF8EA0B5.toInt())
                            textSize = 14f
                            setPadding(dp(6), dp(10), dp(6), dp(10))
                        }
                        val span = GridLayout.LayoutParams().apply {
                            width = 0
                            columnSpec = GridLayout.spec(0, 2)
                        }
                        binding.live.addView(empty, span)
                    }
                    for (index in 0 until rooms.length()) {
                        val room = rooms.getJSONObject(index)
                        binding.live.addView(roomButton(room))
                    }
                }
            } catch (error: Exception) {
                runOnUiThread { binding.loginError.text = error.message }
            }
        }
    }

    private fun roomButton(room: JSONObject): View {
        val type = when (room.optString("type")) {
            "wall" -> "Стена"
            "stream" -> "Эфир"
            else -> "Комната"
        }
        val view = layoutInflater.inflate(R.layout.item_room, binding.live, false)
        view.findViewById<TextView>(R.id.kind).text = type
        view.findViewById<TextView>(R.id.roomTitle).text = room.optString("title").ifBlank { "Без названия" }
        val peers = room.optInt("peers")
        val people = when (peers) {
            0 -> "пусто"
            1 -> "1 человек"
            else -> "$peers в комнате"
        }
        view.findViewById<TextView>(R.id.roomMeta).text = "${room.optString("code")}\n$people"
        view.setOnClickListener { joinKnown(room) }
        val params = GridLayout.LayoutParams().apply {
            width = 0
            height = GridLayout.LayoutParams.WRAP_CONTENT
            columnSpec = GridLayout.spec(GridLayout.UNDEFINED, 1f)
            val gap = dp(6)
            setMargins(gap, gap, gap, gap)
        }
        view.layoutParams = params
        return view
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun createWall() {
        binding.createWall.isEnabled = false
        binding.createWall.alpha = 0.55f
        io.execute {
            try {
                val code = Api(prefs.baseUrl).createWall(prefs.token)
                runOnUiThread { openRoom(code, "") }
            } catch (error: Exception) {
                runOnUiThread { binding.loginError.text = error.message ?: "Не удалось создать стену" }
            } finally {
                runOnUiThread {
                    binding.createWall.isEnabled = true
                    binding.createWall.alpha = 1f
                }
            }
        }
    }

    private fun joinTyped() {
        val code = binding.code.text?.toString().orEmpty().trim()
        val typed = binding.roomPassword.text?.toString().orEmpty()
        if (code.isBlank()) {
            binding.loginError.text = "Введите код комнаты"
            return
        }
        if (typed.isNotBlank()) {
            openRoom(code, typed)
            return
        }
        binding.loginError.text = ""
        io.execute {
            try {
                val info = Api(prefs.baseUrl).publicRoom(code)
                runOnUiThread {
                    if (info.optBoolean("hasPassword")) askPassword(code, info.optString("title"))
                    else openRoom(code, "")
                }
            } catch (error: Exception) {
                runOnUiThread { binding.loginError.text = error.message ?: "Не удалось открыть комнату" }
            }
        }
    }

    private fun joinKnown(room: JSONObject) {
        val code = room.optString("code")
        if (!room.optBoolean("hasPassword")) {
            openRoom(code, "")
            return
        }
        val typed = binding.roomPassword.text?.toString().orEmpty()
        val sameCode = binding.code.text?.toString().orEmpty().trim().equals(code, ignoreCase = true)
        if (sameCode && typed.isNotBlank()) {
            openRoom(code, typed)
            return
        }
        askPassword(code, room.optString("title"))
    }

    private fun askPassword(code: String, title: String) {
        val input = TextInputEditText(this).apply {
            inputType = InputType.TYPE_CLASS_TEXT
            setTextColor(0xFFE8EEF6.toInt())
            setSingleLine(true)
            if (prefs.lastCode.equals(code, ignoreCase = true)) setText(prefs.lastPassword)
        }
        val box = TextInputLayout(this).apply {
            hint = "Пароль комнаты"
            boxBackgroundMode = TextInputLayout.BOX_BACKGROUND_OUTLINE
            setBoxCornerRadii(dp(16).toFloat(), dp(16).toFloat(), dp(16).toFloat(), dp(16).toFloat())
            addView(input)
        }
        val frame = FrameLayout(this).apply {
            val side = dp(22)
            setPadding(side, dp(8), side, 0)
            addView(box)
        }
        val heading = title.ifBlank { code }
        val dialog = MaterialAlertDialogBuilder(this)
            .setTitle(heading)
            .setMessage("Введите пароль, чтобы войти в комнату")
            .setView(frame)
            .setPositiveButton("Войти", null)
            .setNegativeButton("Отмена", null)
            .create()
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                dialog.dismiss()
                openRoom(code, input.text?.toString().orEmpty())
            }
            input.requestFocus()
        }
        dialog.show()
    }

    private fun openRoom(code: String, password: String) {
        val room = code.trim().lowercase()
        if (room.isBlank()) {
            binding.loginError.text = "Введите код комнаты"
            return
        }
        prefs.lastCode = room
        prefs.lastPassword = password
        startActivity(
            Intent(this, WallActivity::class.java)
                .putExtra(WallActivity.EXTRA_CODE, room)
                .putExtra(WallActivity.EXTRA_PASSWORD, password),
        )
    }
}
