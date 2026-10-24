package app.riwaq.tv

import android.content.Context
import org.json.JSONObject

/**
 * إعدادات المستخدم: نص JSON واحد محفوظ على التلفزيون نفسه بس (البريف قسم ٥).
 * نفس الشكل اللي تقراه الصفحة في web/js/config.js.
 */
object ConfigStore {
    private const val PREFS = "riwaq"
    private const val KEY = "config"
    private const val MAX_BYTES = 64 * 1024

    /** يزيد كل ما تتغير الإعدادات، عشان الواجهة تعرف إنها لازم تعيد التحميل */
    @Volatile var version = 0L
        private set

    fun get(ctx: Context): String =
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "{}") ?: "{}"

    /** يحفظ بس إذا النص JSON سليم وحجمه معقول. يرجع false لو مرفوض */
    fun set(ctx: Context, json: String): Boolean {
        if (json.length > MAX_BYTES) return false
        val obj = try { JSONObject(json) } catch (e: Exception) { return false }
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, obj.toString()).apply()
        version++
        return true
    }
}
