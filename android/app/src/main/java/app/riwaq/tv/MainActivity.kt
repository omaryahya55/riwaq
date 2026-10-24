package app.riwaq.tv

import android.annotation.SuppressLint
import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import android.view.KeyEvent
import android.webkit.WebView

/**
 * الواجهة الرئيسية. صفحة رواق كاملة داخل WebView، والتطبيقات تنفتح عن طريق الجسر.
 * زر الرجوع: يروح للصفحة (تقفل القوائم). في الواجهة نفسها ما يسوي شي، مثل أي واجهة تلفزيون.
 */
class MainActivity : Activity() {

    private lateinit var web: WebView
    private var loadedVersion = -1L
    private var pendingQuick = false
    private var pendingSaver = false
    private var pendingSettings = false

    // تطبيق انركّب أو انحذف: نحدّث صف التطبيقات
    private val pkgReceiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context, i: Intent) {
            web.evaluateJavascript("window.Home&&Home.appsChanged()", null)
        }
    }

    @SuppressLint("AddJavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // ما نحط FLAG_KEEP_SCREEN_ON: نبي أندرويد يشغّل شاشة التوقف لحاله لما يكون التلفزيون خامل
        web = WebHost.create(this)
        web.addJavascriptInterface(RiwaqBridge(this, web), "Riwaq")
        setContentView(web)
        load()
        if (intent?.action == ACTION_QUICK || intent?.action == Intent.ACTION_ALL_APPS) {
            // أول تشغيل: ننتظر الصفحة تحمّل، وبعدها نفتح اللوحة (إذا ما انفتحت)
            web.postDelayed({ web.evaluateJavascript("document.querySelector('[data-k=quick].on')||($QUICK_JS)", null) }, 2500)
        }
        if (intent?.action == ACTION_SETTINGS) web.postDelayed({ web.evaluateJavascript(SETTINGS_JS, null) }, 2500)

        val f = IntentFilter().apply {
            addAction(Intent.ACTION_PACKAGE_ADDED)
            addAction(Intent.ACTION_PACKAGE_REMOVED)
            addAction(Intent.ACTION_PACKAGE_CHANGED)
            addDataScheme("package")
        }
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(pkgReceiver, f, Context.RECEIVER_NOT_EXPORTED)
        else @Suppress("UnspecifiedRegisterReceiverFlag") registerReceiver(pkgReceiver, f)
    }

    private fun load() {
        loadedVersion = ConfigStore.version
        web.loadUrl(WebHost.PAGE)
        web.requestFocus()
    }

    override fun onResume() {
        super.onResume()
        // الإعدادات تغيرت من الجوال: نعيد التحميل عشان تطبق
        if (ConfigStore.version != loadedVersion) load()
        else if (pendingSettings) web.evaluateJavascript(SETTINGS_JS, null)
        else if (pendingSaver) web.evaluateJavascript("window.App&&App.show('saver')", null)
        else if (pendingQuick) web.evaluateJavascript(QUICK_JS, null)
        else web.evaluateJavascript("window.App&&App.show('home')", null)
        pendingQuick = false
        pendingSaver = false
        pendingSettings = false
        web.onResume()
    }

    override fun onPause() {
        web.onPause()
        super.onPause()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (intent.action == ACTION_SETTINGS) {
            pendingSettings = true // إعدادات رواق من اللوحة السريعة: تمر على رمز القفل (لو فيه)
            return
        }
        if (intent.action == ACTION_SAVER) {
            pendingSaver = true // نفتحها في onResume (بعد ما ترجع الواجهة)
            return
        }
        if (intent.action == Intent.ACTION_ALL_APPS || intent.action == ACTION_QUICK) {
            // ضغطة البيت المطوّلة (من HomeKeyService، أو بعض الأجهزة ترسلها كطلب "كل التطبيقات")
            // أندرويد يوقف الواجهة قبل ما يوصلها الطلب، فنفتح اللوحة في onResume (بعد ما ترجع)
            pendingQuick = true
            web.evaluateJavascript(QUICK_JS, null)
            return
        }
        // ضغط زر البيت وهو مفتوح: نرجع للواجهة ونقفل أي قائمة
        web.evaluateJavascript("window.App&&App.show('home')", null)
    }

    @Deprecated("زر الرجوع في أندرويد التلفزيون")
    override fun onBackPressed() {
        web.evaluateJavascript("window.RiwaqBack&&window.RiwaqBack()", null)
        // ما ننادي super: الواجهة الرئيسية ما تتسكر بزر الرجوع
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.keyCode == KeyEvent.KEYCODE_BACK) {
            if (event.action == KeyEvent.ACTION_UP) @Suppress("DEPRECATION") onBackPressed()
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    override fun onDestroy() {
        try { unregisterReceiver(pkgReceiver) } catch (e: Exception) { }
        web.destroy()
        super.onDestroy()
    }

    companion object {
        /** ضغطة البيت المطوّلة (HomeKeyService) */
        const val ACTION_QUICK = "app.riwaq.tv.QUICK"
        /** "شاشة الانتظار الحين" من اللوحة السريعة (لو الجهاز ما فيه شاشة توقف النظام) */
        const val ACTION_SAVER = "app.riwaq.tv.SAVER"
        /** "إعدادات رواق" من اللوحة السريعة: الصفحة تطلب رمز القفل قبل ما تفتحها */
        const val ACTION_SETTINGS = "app.riwaq.tv.SETTINGS"
        private const val SETTINGS_JS = "window.App&&App.show('home'),window.Home&&Home.openSettings()"
        private const val QUICK_JS = "window.App&&App.show('home'),window.Home&&Home.openQuick()"
    }
}
