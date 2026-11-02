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

    // الأسرار: ما ترجع للجوال أبداً (صفحة الإعدادات تمر على HTTP محلي). المفتاح ← (الكائن اللي فيه الحقل، اسم الحقل)
    private val SECRETS = listOf("icalUrl" to (null to "icalUrl"), "todoistToken" to (null to "todoistToken"),
        "pin" to ("lock" to "pin"), "tgToken" to ("telegram" to "token"))

    private fun holder(o: JSONObject, parent: String?): JSONObject? = if (parent == null) o else o.optJSONObject(parent)

    /** الإعدادات للجوال بدون الأسرار: الحقل فاضي، و _secrets يقول أيّها محفوظ (الجوال يعرض "محفوظ" بدون قيمته) */
    fun redacted(ctx: Context): String {
        val obj = try { JSONObject(get(ctx)) } catch (e: Exception) { JSONObject() }
        val flags = JSONObject()
        for ((key, path) in SECRETS) {
            val h = holder(obj, path.first) ?: continue
            if (h.optString(path.second, "").isNotEmpty()) { flags.put(key, true); h.put(path.second, "") }
        }
        return obj.put("_secrets", flags).toString()
    }

    /**
     * إعدادات جاية من الجوال: السر الفاضي يبقى على قيمته المحفوظة، إلا لو الجوال طلب حذفه صراحة (_clear).
     * هذا يخلي الجوال يحفظ بدون ما يعرف الأسرار القديمة أو يرجعها.
     */
    fun merge(ctx: Context, incoming: String): String? {
        val inc = try { JSONObject(incoming) } catch (e: Exception) { return null }
        val stored = try { JSONObject(get(ctx)) } catch (e: Exception) { JSONObject() }
        val clear = inc.optJSONArray("_clear")
        val clearSet = (0 until (clear?.length() ?: 0)).map { clear!!.optString(it) }.toSet()
        inc.remove("_clear"); inc.remove("_secrets")
        for ((key, path) in SECRETS) {
            val old = holder(stored, path.first)?.optString(path.second, "").orEmpty()
            if (old.isEmpty() || key in clearSet) continue
            val h = if (path.first == null) inc else (inc.optJSONObject(path.first) ?: JSONObject().also { inc.put(path.first, it) })
            if (h.optString(path.second, "").isEmpty()) h.put(path.second, old)
        }
        return inc.toString()
    }

    /**
     * يحفظ بس إذا النص JSON سليم وحجمه معقول. يرجع false لو مرفوض.
     * external = التغيير جا من الجوال (الواجهة لازم تعيد التحميل). الصفحة نفسها تحفظ بـ false
     */
    fun set(ctx: Context, json: String, external: Boolean = true): Boolean {
        if (json.length > MAX_BYTES) return false
        val obj = try { JSONObject(json) } catch (e: Exception) { return false }
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, obj.toString()).apply()
        if (external) version++
        return true
    }
}
