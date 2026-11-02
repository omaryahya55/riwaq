package app.riwaq.tv

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import android.webkit.WebView
import android.widget.ImageView
import android.widget.LinearLayout
import org.json.JSONObject
import java.net.URLEncoder

/**
 * شاشة المجلس: باركود واي فاي للضيوف بضغطة. اسم الشبكة وكلمتها يكتبهم صاحب البيت من الجوال، وينحفظون هنا لحالهم:
 * مو في إعدادات الصفحة (ما توصل لها الصفحة أبداً)، وما ترجع للجوال. الشاشة تنقفل لحالها بعد ٥ دقايق.
 */
object Majlis {
    private const val PREFS = "riwaq.majlis"
    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun ssid(ctx: Context) = prefs(ctx).getString("ssid", "") ?: ""
    fun isSet(ctx: Context) = ssid(ctx).isNotEmpty()

    /** من الجوال: { ssid, pass }. يرجع false لو القيم غلط */
    fun save(ctx: Context, json: String): Boolean {
        val o = try { JSONObject(json) } catch (e: Exception) { return false }
        val ssid = o.optString("ssid").trim(); val pass = o.optString("pass")
        if (ssid.isEmpty() || ssid.length > 32 || pass.length > 63) return false
        prefs(ctx).edit().putString("ssid", ssid).putString("pass", pass).apply()
        return true
    }

    fun clear(ctx: Context) { prefs(ctx).edit().clear().apply() }

    fun qrText(ctx: Context): String {
        val esc = { s: String -> s.replace(Regex("([\\\\;,:\"])"), "\\\\$1") }
        val pass = prefs(ctx).getString("pass", "") ?: ""
        return if (pass.isEmpty()) "WIFI:T:nopass;S:${esc(ssid(ctx))};;" else "WIFI:T:WPA;S:${esc(ssid(ctx))};P:${esc(pass)};;"
    }
}

class MajlisActivity : Activity() {
    private val handler = Handler(Looper.getMainLooper())
    private val close = Runnable { finish() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val ui = TvUi(this)
        ui.attach()
        ui.add(ui.text("أهلاً وسهلاً", 0.06f, ui.gold, true), 0f)
        if (Majlis.isSet(this)) {
            ui.add(ui.text("صوّر الباركود بجوالك عشان تتصل بالواي فاي", 0.03f, ui.ink), 0.02f)
            ui.add(ui.text("الشبكة: ${Majlis.ssid(this)}", 0.026f, ui.ink2))
            val size = ui.px(0.5f)
            ui.list.addView(ImageView(this).apply { setImageBitmap(TvUi.qr(Majlis.qrText(this@MajlisActivity), size)) },
                LinearLayout.LayoutParams(size, size).apply { topMargin = ui.px(0.03f) })
            ui.add(ui.text("تنقفل لحالها بعد ٥ دقايق", 0.022f, ui.ink2), 0.02f)
        } else {
            ui.add(ui.text("اكتب اسم شبكة الضيوف وكلمتها من الجوال أول: إعدادات رواق ← شاشة المجلس.", 0.03f, ui.ink), 0.03f)
        }
        ui.add(ui.button("رجوع") { finish() }.also { it.requestFocus() }, 0.03f)
        handler.postDelayed(close, 5 * 60_000L)
    }

    // ما تبقى الكلمة على الشاشة لو الواحد طلع منها
    override fun onStop() { super.onStop(); finish() }
    override fun onDestroy() { handler.removeCallbacks(close); super.onDestroy() }
}

/**
 * الإبلاغ عن مشكلة: نص يشوفه صاحب الجهاز كامل قبل أي شي، وباركود يفتحه في إيميل جواله.
 * ما يرسل شي لحاله. فيه الإصدار والموديل وآخر خطأ في الصفحة بس: بدون شبكة ولا مدينة ولا أي إعداد.
 */
class ReportActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val ui = TvUi(this)
        ui.attach()
        val text = report(this)
        ui.add(ui.text("إبلاغ عن مشكلة", 0.05f, ui.gold, true), 0f)
        ui.add(ui.text("صوّر الباركود، ويفتح إيميل جاهز في جوالك: اكتب وش صار وأرسله. ما ينرسل شي بدون ما ترسله أنت. هذا كل اللي فيه:", 0.024f, ui.ink2), 0.02f)
        ui.add(ui.text(text, 0.022f, ui.ink))
        val mail = "mailto:$EMAIL?subject=" + URLEncoder.encode("مشكلة في رواق", "UTF-8").replace("+", "%20") +
            "&body=" + URLEncoder.encode("وش صار:\n\n\n---\n$text", "UTF-8").replace("+", "%20")
        val size = ui.px(0.42f)
        ui.list.addView(ImageView(this).apply { setImageBitmap(TvUi.qr(mail, size)) }, LinearLayout.LayoutParams(size, size).apply { topMargin = ui.px(0.02f) })
        ui.add(ui.button("رجوع") { finish() }.also { it.requestFocus() }, 0.03f)
    }

    companion object {
        private const val EMAIL = "riwaq.app1@gmail.com"
        private const val PREFS = "riwaq.report"

        fun saveError(ctx: Context, msg: String) {
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("err", msg.take(240)).apply()
        }

        fun report(ctx: Context): String {
            val wv = WebView.getCurrentWebViewPackage()?.versionName ?: "?"
            val err = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("err", "") ?: ""
            return listOf(
                "رواق ${BuildConfig.VERSION_NAME} (${if (BuildConfig.HAS_KEYS) "كاملة" else "خفيفة"})",
                "الجهاز: ${Build.MANUFACTURER} ${Build.MODEL}، أندرويد ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})",
                "WebView: $wv",
                "الواجهة الرئيسية: ${if (SetupActivity.isHome(ctx)) "رواق" else "مو رواق"}",
                "خدمة الأزرار: ${if (!BuildConfig.HAS_KEYS) "ما فيها" else if (SetupActivity.a11yOn(ctx)) "شغالة" else "متوقفة"}",
                "أيام الأذان المجدولة: ${AdhanScheduler.daysLeft(ctx)}",
                "آخر خطأ: ${err.ifEmpty { "ما فيه" }}"
            ).joinToString("\n")
        }
    }
}

/**
 * WebView قديم: صفحة رواق تحتاج Chrome 87 وفوق، وبدونه تطلع شاشة سوداء. هذي الشاشة أصلية عشان تشتغل حتى لو المحرك قديم،
 * وفيها طريق الرجوع للواجهة الأصلية، عشان التلفزيون ما يعلق أبداً.
 */
class WebViewOutdatedActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val ui = TvUi(this)
        ui.attach()
        ui.add(ui.text("رواق يحتاج تحديث متصفح النظام", 0.05f, ui.gold, true), 0f)
        ui.add(ui.text("نسخة Android System WebView على هذا الجهاز: ${WebHost.webViewMajor()}. رواق يحتاج ${WebHost.MIN_WEBVIEW} وفوق.", 0.028f, ui.ink), 0.02f)
        val first = ui.button("حدّث من المتجر") {
            try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=com.google.android.webview"))) } catch (e: Exception) { startActivity(Intent(android.provider.Settings.ACTION_SETTINGS)) }
        }
        ui.add(first, 0.03f)
        ui.add(ui.button("الرجوع للواجهة الأصلية") { startActivity(Intent(this, RestoreActivity::class.java)) })
        ui.add(ui.button("إعدادات التلفزيون") { startActivity(Intent(android.provider.Settings.ACTION_SETTINGS)) })
        ui.add(ui.button("جرّب مرة ثانية") {
            if (!WebHost.tooOld()) startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP))
            finish()
        })
        first.requestFocus()
        ui.list.layoutParams?.let { it.height = ViewGroup.LayoutParams.WRAP_CONTENT }
    }
    @Deprecated("زر الرجوع")
    override fun onBackPressed() { /* هذي الواجهة الرئيسية وقتها: ما تتسكر بالرجوع */ }
}
