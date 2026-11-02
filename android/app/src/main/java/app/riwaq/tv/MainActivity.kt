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
 * الأوامر اللي تجي قبل ما تجهز الصفحة تنتظر في طابور لين الصفحة تقول إنها جاهزة (Riwaq.ready)،
 * فما تضيع: مثل زر تطبيق مقفل، أو "الرجوع للواجهة الأصلية".
 */
class MainActivity : Activity() {

    private var web: WebView? = null
    private var bridge: RiwaqBridge? = null
    private var loadedVersion = -1L
    private var pageReady = false
    private val pending = ArrayList<String>()

    /** تطبيق مقفل من زر ريموت: الصفحة تطلب الرمز وبعدها تفتحه. نتحقق من اسم الحزمة قبل ما ندخله في JS */
    private fun launchJs(i: Intent?): String? {
        val pkg = i?.getStringExtra("pkg") ?: return null
        if (!Regex("^[A-Za-z0-9_.]{1,200}$").matches(pkg)) return null
        return "window.App&&App.show('home'),window.Home&&Home.launchApp('$pkg')"
    }

    // تطبيق انركّب أو انحذف: نحدّث صف التطبيقات
    private val pkgReceiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context, i: Intent) { runJs("window.Home&&Home.appsChanged()") }
    }

    /** ينفذ أمر في الصفحة، أو يخليه ينتظر لين تجهز */
    private fun runJs(js: String) {
        val w = web
        if (w != null && pageReady) w.evaluateJavascript(js, null) else pending += js
    }

    private fun onPageReady() {
        pageReady = true
        val list = ArrayList(pending)
        pending.clear()
        list.forEach { web?.evaluateJavascript(it, null) }
    }

    @SuppressLint("AddJavascriptInterface")
    private fun buildWeb() {
        val w = WebHost.create(this) { rebuild() }
        val b = RiwaqBridge(this, w) { onPageReady() }
        w.addJavascriptInterface(b, "Riwaq")
        web = w
        bridge = b
        setContentView(w)
        load()
    }

    /** محرك الصفحة مات (الذاكرة خلصت): نبني واحد جديد، وخدمة الأزرار والأذان ما يتأثرون */
    private fun rebuild() {
        bridge?.close()
        try { web?.destroy() } catch (e: Exception) { }
        web = null
        bridge = null
        pageReady = false
        buildWeb()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // WebView قديم: الصفحة تطلع سوداء، فنفتح شاشة أصلية فيها التحديث والرجوع للواجهة الأصلية
        if (WebHost.tooOld()) {
            startActivity(Intent(this, WebViewOutdatedActivity::class.java))
            finish()
            return
        }
        // ما نحط FLAG_KEEP_SCREEN_ON: نبي أندرويد يشغّل شاشة التوقف لحاله لما يكون التلفزيون خامل
        buildWeb()
        if (savedInstanceState == null && intent?.action == Intent.ACTION_MAIN) SetupActivity.maybeLaunch(this)
        if (intent?.action == ACTION_QUICK || intent?.action == Intent.ACTION_ALL_APPS) runJs("document.querySelector('[data-k=quick].on')||($QUICK_JS)")
        if (intent?.action == ACTION_LAUNCH) launchJs(intent)?.let { runJs(it) }
        if (intent?.action == ACTION_SETTINGS) runJs(SETTINGS_JS)
        if (intent?.action == ACTION_RESTORE) runJs(RESTORE_JS)

        val f = IntentFilter().apply {
            addAction(Intent.ACTION_PACKAGE_ADDED)
            addAction(Intent.ACTION_PACKAGE_REMOVED)
            addAction(Intent.ACTION_PACKAGE_CHANGED)
            addDataScheme("package")
        }
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(pkgReceiver, f, Context.RECEIVER_NOT_EXPORTED)
        else @Suppress("UnspecifiedRegisterReceiverFlag") registerReceiver(pkgReceiver, f)
        askWatchNextOnce()
    }

    /** أكمل المشاهدة يحتاج إذن مرة وحدة. لو رفض المستخدم الصف ما يطلع، وما نسأل مرة ثانية */
    private fun askWatchNextOnce() {
        val p = getSharedPreferences("riwaq.setup", Context.MODE_PRIVATE)
        if (p.getBoolean("watchAsked", false) || WatchNext.allowed(this)) return
        p.edit().putBoolean("watchAsked", true).apply()
        try { requestPermissions(arrayOf("android.permission.READ_TV_LISTINGS"), 21) } catch (e: Exception) { }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 21) runJs("window.Home&&Home.appsChanged()")
    }

    private fun load() {
        loadedVersion = ConfigStore.version
        pageReady = false
        web?.loadUrl(WebHost.PAGE)
        web?.requestFocus()
    }

    override fun onResume() {
        super.onResume()
        // الإعدادات تغيرت من الجوال: نعيد التحميل عشان تطبق. الأوامر المعلقة تنتظر الصفحة الجديدة
        if (web != null && ConfigStore.version != loadedVersion) load()
        // الأمر المعلق من onNewIntent، وإلا نرجع للواجهة
        if (pendingAction != null) { runJs(pendingAction!!); pendingAction = null }
        else runJs("window.App&&App.show('home')")
        web?.onResume()
        Update.checkDaily(this)
    }

    override fun onPause() {
        web?.onPause()
        super.onPause()
    }

    private var pendingAction: String? = null

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        when (intent.action) {
            ACTION_LAUNCH -> launchJs(intent)?.let { pendingAction = it }
            ACTION_RESTORE -> pendingAction = RESTORE_JS
            ACTION_SETTINGS -> pendingAction = SETTINGS_JS // تمر على رمز القفل (لو فيه)
            ACTION_SAVER -> pendingAction = "window.App&&App.show('saver')"
            // ضغطة البيت المطوّلة: أندرويد يوقف الواجهة قبل ما يوصلها الطلب، فنفتح اللوحة في onResume
            Intent.ACTION_ALL_APPS, ACTION_QUICK -> pendingAction = QUICK_JS
            // ضغط زر البيت وهو مفتوح: نرجع للواجهة ونقفل أي قائمة
            else -> runJs("window.App&&App.show('home')")
        }
    }

    @Deprecated("زر الرجوع في أندرويد التلفزيون")
    override fun onBackPressed() {
        if (AdhanService.playing) { AdhanService.stop(this); return } // الأذان شغال: الرجوع يوقفه
        runJs("window.RiwaqBack&&window.RiwaqBack()")
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
        bridge?.close()
        web?.destroy()
        web = null
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
        /** "الرجوع للواجهة الأصلية" من اللوحة السريعة: تمر على رمز القفل */
        const val ACTION_RESTORE = "app.riwaq.tv.RESTORE"
        /** فتح تطبيق مقفل من زر ريموت: تمر على رمز القفل */
        const val ACTION_LAUNCH = "app.riwaq.tv.LAUNCH"
        private const val RESTORE_JS = "window.App&&App.show('home'),window.Home&&Home.openRestore()"
        private const val QUICK_JS = "window.App&&App.show('home'),window.Home&&Home.openQuick()"
    }
}
