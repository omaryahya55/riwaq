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
        else web.evaluateJavascript("window.App&&App.show('home')", null)
        web.onResume()
    }

    override fun onPause() {
        web.onPause()
        super.onPause()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (intent.action == Intent.ACTION_ALL_APPS) {
            // بعض أجهزة أندرويد ترسل ضغطة البيت المطوّلة كطلب "كل التطبيقات": نفتح اللوحة السريعة
            web.evaluateJavascript("window.App&&App.show('home');window.Home&&Home.openQuick()", null)
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
}
