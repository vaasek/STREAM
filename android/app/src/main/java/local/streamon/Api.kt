package local.streamon

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

class Api(rawBase: String) {
    val base: String = normalize(rawBase)
    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()
    private val json = "application/json; charset=utf-8".toMediaType()

    fun login(email: String, password: String): JSONObject {
        return post("/api/auth/login", null, JSONObject().put("email", email.trim()).put("password", password))
    }

    fun me(token: String): JSONObject = get("/api/auth/me", token)

    fun createWall(token: String): String {
        val data = post(
            "/api/rooms",
            token,
            JSONObject()
                .put("title", "Стена экранов")
                .put("type", "wall")
                .put("isPublic", true)
                .put("maxParticipants", 0),
        )
        return data.getJSONObject("room").getString("code")
    }

    fun live(token: String): JSONArray = get("/api/live", token).optJSONArray("rooms") ?: JSONArray()

    fun publicRoom(code: String): JSONObject = get("/api/rooms/${code.trim().lowercase()}/public", null)

    private fun get(path: String, token: String?): JSONObject {
        val builder = Request.Builder().url(base + path)
        if (!token.isNullOrBlank()) builder.header("Authorization", "Bearer $token")
        return execute(builder.build())
    }

    private fun post(path: String, token: String?, body: JSONObject): JSONObject {
        val builder = Request.Builder()
            .url(base + path)
            .post(body.toString().toRequestBody(json))
        if (!token.isNullOrBlank()) builder.header("Authorization", "Bearer $token")
        return execute(builder.build())
    }

    private fun execute(request: Request): JSONObject {
        http.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            val data = try {
                if (text.isBlank()) JSONObject() else JSONObject(text)
            } catch (_: Exception) {
                JSONObject()
            }
            if (!response.isSuccessful) {
                throw IOException(data.optString("error").ifBlank { "Ошибка ${response.code}" })
            }
            return data
        }
    }

    companion object {
        fun normalize(raw: String): String {
            var url = raw.trim().trimEnd('/')
            if (!url.startsWith("http://") && !url.startsWith("https://")) url = "http://$url"
            return url
        }
    }
}
