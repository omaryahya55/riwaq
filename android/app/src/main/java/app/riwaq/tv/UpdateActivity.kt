package app.riwaq.tv

import android.app.Activity
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Toast
import org.json.JSONArray
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * تحديث رواق من صفحة إصداراته في GitHub بزر. ما فيه تحديث لكود الصفحة عن بعد: الصفحة لها جسر أصلي،
 * فكل تحديث يمر على APK موقّع، وأندرويد نفسه يرفض أي ملف بتوقيع مختلف.
 * النظام يطلب موافقة مرة لكل تطبيق، وتأكيد مع كل تحديث. وPlay Protect ممكن يوقفه، وما نلتف عليه.
 */
class UpdateActivity : Activity() {
    private lateinit var ui: TvUi
    private var found: Update.Release? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ui = TvUi(this)
        ui.attach()
        check()
    }

    override fun onResume() {
        super.onResume()
        found?.let { show(it) }
    }

    private fun page(vararg add: () -> Unit) {
        ui.list.removeAllViews()
        ui.add(ui.text("تحديث رِواق", 0.05f, ui.gold, true), 0f)
        ui.add(ui.text("نسختك الحين: ${BuildConfig.VERSION_NAME} (${if (BuildConfig.HAS_KEYS) "الكاملة" else "الخفيفة"})", 0.026f, ui.ink2))
        add.forEach { it() }
    }

    private fun back() = ui.button("رجوع") { finish() }

    private fun check() {
        page({ ui.add(ui.text("نتأكد من آخر إصدار…", 0.028f, ui.ink), 0.03f) })
        Thread {
            val r = Update.latest()
            runOnUiThread {
                when {
                    isFinishing -> {}
                    r == null -> page({ ui.add(ui.text("ما قدرنا نوصل لصفحة الإصدارات. تأكد من النت وجرّب بعدين.", 0.028f, ui.warn), 0.03f) }, { ui.add(back().also { it.requestFocus() }, 0.03f) })
                    !Update.newer(r.version) -> page({ ui.add(ui.text("✓ عندك آخر نسخة", 0.03f, ui.ok), 0.03f) }, { ui.add(back().also { it.requestFocus() }, 0.03f) })
                    else -> { found = r; show(r) }
                }
            }
        }.start()
    }

    private fun show(r: Update.Release) {
        val can = packageManager.canRequestPackageInstalls()
        page({
            ui.add(ui.text("فيه نسخة جديدة: ${r.version}", 0.032f, ui.ink, true), 0.03f)
            if (!can) {
                ui.add(ui.text("أول مرة: اسمح لرواق يركّب التحديثات، وارجع هنا بزر الرجوع.", 0.024f, ui.ink2))
                ui.add(ui.button("افتح صفحة السماح") { openAllow() }.also { it.requestFocus() })
            } else {
                ui.add(ui.text("إعداداتك تبقى زي ما هي. النظام بيطلب منك تأكيد التركيب.", 0.024f, ui.ink2))
                ui.add(ui.button("حدّث الحين") { download(r) }.also { it.requestFocus() })
            }
        }, { ui.add(back(), 0.03f) })
    }

    private fun openAllow() {
        try { startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName"))) } catch (e: Exception) {
            Toast.makeText(this, "من إعدادات التلفزيون ← التطبيقات ← الوصول الخاص ← تثبيت تطبيقات غير معروفة ← رِواق", Toast.LENGTH_LONG).show()
        }
    }

    private fun download(r: Update.Release) {
        if (AdhanService.playing) { Toast.makeText(this, "ننتظر الأذان يخلص", Toast.LENGTH_LONG).show(); return }
        page({ ui.add(ui.text("نحمّل النسخة…", 0.028f, ui.ink), 0.03f) })
        Thread {
            val err = try { install(r); null } catch (e: Exception) { e.message ?: "ما انحمّل الملف" }
            if (err != null) runOnUiThread { page({ ui.add(ui.text(err, 0.028f, ui.warn), 0.03f) }, { ui.add(back().also { it.requestFocus() }, 0.03f) }) }
        }.start()
    }

    private fun install(r: Update.Release) {
        val f = File(cacheDir, "update.apk")
        Update.fetch(r, f)
        val pi = packageManager.packageInstaller
        val id = pi.createSession(PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL))
        pi.openSession(id).use { s ->
            s.openWrite("riwaq", 0, f.length()).use { out -> f.inputStream().use { it.copyTo(out); s.fsync(out) } }
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
            s.commit(PendingIntent.getActivity(this, 11, Intent(this, UpdateActivity::class.java).setAction(ACTION_RESULT), flags).intentSender)
        }
        f.delete()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (intent.action != ACTION_RESULT) return
        when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                @Suppress("DEPRECATION") val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
                if (confirm != null) startActivity(confirm)
            }
            PackageInstaller.STATUS_SUCCESS -> finish()
            else -> page({ ui.add(ui.text("ما تم التحديث. ممكن Play Protect وقفه، أو ما وافقت عليه. تقدر تحدّث بالكمبيوتر (docs/SETUP.md).", 0.028f, ui.warn), 0.03f) }, { ui.add(back().also { it.requestFocus() }, 0.03f) })
        }
    }

    companion object { private const val ACTION_RESULT = "app.riwaq.tv.UPDATE_RESULT" }
}

object Update {
    private const val API = "https://api.github.com/repos/omaryahya55/riwaq/releases?per_page=5"
    private const val MAX_APK = 60L * 1024 * 1024
    private const val PREFS = "riwaq.update"
    class Release(val version: String, val url: String, val size: Long, val sha256: String?)

    private fun parts(v: String) = v.split(".").map { it.toIntOrNull() ?: 0 }
    fun newer(v: String): Boolean {
        val a = parts(v); val b = parts(BuildConfig.VERSION_NAME)
        for (i in 0 until maxOf(a.size, b.size)) {
            val x = a.getOrElse(i) { 0 }; val y = b.getOrElse(i) { 0 }
            if (x != y) return x > y
        }
        return false
    }

    /** اسم الملف في الإصدار: riwaq-1.2.3.apk للخفيفة و riwaq-full-1.2.3.apk للكاملة */
    fun latest(): Release? = try {
        val c = URL(API).openConnection() as HttpURLConnection
        c.connectTimeout = 10000; c.readTimeout = 10000
        c.setRequestProperty("User-Agent", "Riwaq/${BuildConfig.VERSION_NAME}")
        c.setRequestProperty("Accept", "application/vnd.github+json")
        val arr = JSONArray(c.inputStream.bufferedReader().use { it.readText() })
        c.disconnect()
        var out: Release? = null
        for (i in 0 until arr.length()) {
            val r = arr.getJSONObject(i)
            if (r.optBoolean("draft")) continue
            val v = r.optString("tag_name").removePrefix("v")
            if (!Regex("^\\d+\\.\\d+\\.\\d+$").matches(v)) continue
            val name = if (BuildConfig.HAS_KEYS) "riwaq-full-$v.apk" else "riwaq-$v.apk"
            val assets = r.optJSONArray("assets") ?: continue
            for (k in 0 until assets.length()) {
                val a = assets.getJSONObject(k)
                if (a.optString("name") != name) continue
                val u = a.optString("browser_download_url")
                if (u.startsWith("https://github.com/omaryahya55/riwaq/") && a.optLong("size") in 1..MAX_APK)
                    out = Release(v, u, a.optLong("size"), a.optString("digest").removePrefix("sha256:").takeIf { it.length == 64 })
            }
            if (out != null) break
        }
        out
    } catch (e: Exception) { null }

    /** ينزّل الملف ويتأكد من حجمه وبصمته. التوقيع يتأكد منه أندرويد وقت التركيب */
    fun fetch(r: Release, f: File) {
        val c = URL(r.url).openConnection() as HttpURLConnection
        c.connectTimeout = 15000; c.readTimeout = 30000
        c.setRequestProperty("User-Agent", "Riwaq/${BuildConfig.VERSION_NAME}")
        val md = MessageDigest.getInstance("SHA-256")
        var total = 0L
        c.inputStream.use { input ->
            f.outputStream().use { out ->
                val buf = ByteArray(64 * 1024)
                while (true) {
                    val n = input.read(buf)
                    if (n <= 0) break
                    total += n
                    if (total > MAX_APK) throw IllegalStateException("الملف أكبر من المتوقع")
                    md.update(buf, 0, n); out.write(buf, 0, n)
                }
            }
        }
        c.disconnect()
        if (total != r.size) { f.delete(); throw IllegalStateException("الملف ما كمل. جرّب مرة ثانية") }
        val got = md.digest().joinToString("") { "%02x".format(it) }
        if (r.sha256 != null && !got.equals(r.sha256, true)) { f.delete(); throw IllegalStateException("بصمة الملف ما طابقت، فوقفنا التركيب") }
    }

    /** مرة باليوم والواجهة ظاهرة: نحفظ رقم آخر نسخة بس، وتطلع كلمة في قائمة التحكم. ما نرسل شي عن الجهاز */
    fun checkDaily(ctx: Context) {
        val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val now = System.currentTimeMillis()
        if (now - p.getLong("at", 0) < 86_400_000L) return
        p.edit().putLong("at", now).apply()
        Thread { latest()?.let { p.edit().putString("latest", it.version).apply() } }.start()
    }

    fun available(ctx: Context): String {
        val v = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("latest", "") ?: ""
        return if (v.isNotEmpty() && newer(v)) v else ""
    }
}
