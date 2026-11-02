package app.riwaq.tv

import android.annotation.SuppressLint
import android.service.dreams.DreamService
import android.webkit.WebView

/**
 * شاشة التوقف. نفس الصفحة بوضع شاشة التوقف بس (#screen=saver).
 * isInteractive = false: أي زر في الريموت يقفلها ويرجعك للي كنت فيه (أندرويد نفسه يسويها).
 */
class RiwaqDream : DreamService() {

    private var web: WebView? = null
    private var bridge: RiwaqBridge? = null

    @SuppressLint("AddJavascriptInterface")
    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        isInteractive = false
        isFullscreen = true
        isScreenBright = true
        if (WebHost.tooOld()) { finish(); return } // WebView قديم: نرجع لشاشة النظام بدل شاشة سوداء
        val w = WebHost.create(this) { finish() }
        val b = RiwaqBridge(this, w)
        bridge = b
        w.addJavascriptInterface(b, "Riwaq")
        setContentView(w)
        w.loadUrl(WebHost.PAGE + "#screen=saver")
        web = w
    }

    override fun onDetachedFromWindow() {
        bridge?.close()
        bridge = null
        web?.destroy()
        web = null
        super.onDetachedFromWindow()
    }
}
