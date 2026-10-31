package local.streamon

import android.content.Context

class Prefs(context: Context) {
    private val store = context.getSharedPreferences("streamon", Context.MODE_PRIVATE)

    var baseUrl: String
        get() = store.getString("base", "") ?: ""
        set(value) = store.edit().putString("base", value).apply()

    var token: String
        get() = store.getString("token", "") ?: ""
        set(value) = store.edit().putString("token", value).apply()

    var name: String
        get() = store.getString("name", "") ?: ""
        set(value) = store.edit().putString("name", value).apply()

    var email: String
        get() = store.getString("email", "") ?: ""
        set(value) = store.edit().putString("email", value).apply()

    var lastCode: String
        get() = store.getString("code", "") ?: ""
        set(value) = store.edit().putString("code", value).apply()

    var lastPassword: String
        get() = store.getString("roomPassword", "") ?: ""
        set(value) = store.edit().putString("roomPassword", value).apply()

    fun clearSession() {
        token = ""
        name = ""
    }
}
