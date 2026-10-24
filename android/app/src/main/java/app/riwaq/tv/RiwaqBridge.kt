package app.riwaq.tv

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * الجسر بين الصفحة وأندرويد: الصفحة تناديه باسم window.Riwaq.
 * كل دالة هنا تقبل مدخلات من الصفحة، فنتحقق منها ولا نثق فيها.
 */
class RiwaqBridge(private val ctx: Context, private val web: WebView) {

    private val main = Handler(Looper.getMainLooper())
    private val io = Executors.newFixedThreadPool(2)

    @JavascriptInterface fun getConfig(): String = ConfigStore.get(ctx)
    @JavascriptInterface fun setConfig(json: String) { ConfigStore.set(ctx, json, external = false) }
    @JavascriptInterface fun getApps(): String = Apps.listJson(ctx)
    @JavascriptInterface fun getInputs(): String = Apps.inputsJson(ctx)

    @JavascriptInterface fun launch(pkg: String) {
        if (!PKG.matches(pkg)) return
        main.post { Apps.launch(ctx, pkg) }
    }

    @JavascriptInterface fun openInput(id: String) {
        if (id.length > 200) return
        main.post { Apps.openInput(ctx, id) }
    }

    /** إعدادات التلفزيون نفسه (اللوحة السريعة). قائمة ثابتة بس، ولو الشاشة مو موجودة نفتح الإعدادات العامة */
    @JavascriptInterface fun openSystem(which: String) {
        val action = when (which) {
            "wifi" -> android.provider.Settings.ACTION_WIFI_SETTINGS
            "bluetooth" -> android.provider.Settings.ACTION_BLUETOOTH_SETTINGS
            "sound" -> android.provider.Settings.ACTION_SOUND_SETTINGS
            "display" -> android.provider.Settings.ACTION_DISPLAY_SETTINGS
            "date" -> android.provider.Settings.ACTION_DATE_SETTINGS
            else -> android.provider.Settings.ACTION_SETTINGS
        }
        main.post {
            val i = Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            try { ctx.startActivity(i) } catch (e: Exception) {
                try { ctx.startActivity(Intent(android.provider.Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (e2: Exception) { }
            }
        }
    }

    /** أوقات الأذان للأيام الجاية (الصفحة تحسبها). أندرويد يحط منبّه لأقربها */
    @JavascriptInterface fun scheduleAdhan(json: String) { AdhanScheduler.save(ctx, json) }

    /** صفحة "الرجوع للواجهة الأصلية" (الصفحة تطلب رمز القفل قبلها لو فيه) */
    @JavascriptInterface fun openRestore() {
        main.post {
            val i = Intent(ctx, RestoreActivity::class.java)
            if (ctx !is Activity) i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            ctx.startActivity(i)
        }
    }

    @JavascriptInterface fun openSettings() {
        main.post {
            val i = Intent(ctx, SettingsActivity::class.java)
            if (ctx !is Activity) i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            ctx.startActivity(i)
        }
    }

    /**
     * قراءة خلاصة RSS (الصفحة ما تقدر بسبب CORS). HTTPS بس، وأقصى حجم ١ ميجا.
     * النتيجة ترجع للصفحة عن طريق window.__riwaqCb[id](ok, text).
     */
    @JavascriptInterface fun fetchText(url: String, cbId: String) = fetch(url, null, cbId)

    /**
     * مهامك من Todoist (اختياري): نفس fetchText بس مع مفتاح المستخدم في الترويسة.
     * المفتاح يروح لـ api.todoist.com بس، وأي عنوان ثاني مرفوض.
     */
    @JavascriptInterface fun fetchTodoist(url: String, token: String, cbId: String) {
        if (!CB.matches(cbId) || !TODOIST_TOKEN.matches(token)) return
        val host = try { URL(url).host } catch (e: Exception) { return }
        if (host != "api.todoist.com") return
        fetch(url, "Bearer $token", cbId)
    }

    private fun fetch(url: String, auth: String?, cbId: String) {
        if (!CB.matches(cbId)) return
        io.execute {
            var ok = false
            var text = ""
            try {
                val u = URL(url)
                require(u.protocol == "https") { "https only" }
                val c = u.openConnection() as HttpURLConnection
                c.connectTimeout = 10000
                c.readTimeout = 10000
                // المفتاح ما يتبع أي تحويل لموقع ثاني
                c.instanceFollowRedirects = auth == null
                c.setRequestProperty("User-Agent", "Riwaq/1.0 (Android TV)")
                if (auth != null) c.setRequestProperty("Authorization", auth)
                c.inputStream.use { s ->
                    val buf = s.readNBytesCompat(MAX_FEED)
                    text = String(buf, Charsets.UTF_8)
                }
                ok = c.responseCode in 200..299
                c.disconnect()
            } catch (e: Exception) {
                text = "fetch failed"
            }
            val js = "window.__riwaqCb&&window.__riwaqCb[${JSONObject.quote(cbId)}]&&window.__riwaqCb[${JSONObject.quote(cbId)}]($ok,${JSONObject.quote(text)})"
            main.post { web.evaluateJavascript(js, null) }
        }
    }

    private fun java.io.InputStream.readNBytesCompat(max: Int): ByteArray {
        val out = java.io.ByteArrayOutputStream()
        val buf = ByteArray(8192)
        var total = 0
        while (total < max) {
            val n = read(buf, 0, minOf(buf.size, max - total))
            if (n <= 0) break
            out.write(buf, 0, n)
            total += n
        }
        return out.toByteArray()
    }

    companion object {
        private val PKG = Regex("^[A-Za-z0-9_.]{1,200}$")
        private val CB = Regex("^cb[a-z0-9]{1,20}$")
        private val TODOIST_TOKEN = Regex("^[A-Za-z0-9]{20,80}$")
        private const val MAX_FEED = 1024 * 1024
    }
}
