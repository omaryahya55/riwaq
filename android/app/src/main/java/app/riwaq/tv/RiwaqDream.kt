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

    @SuppressLint("AddJavascriptInterface")
    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        isInteractive = false
        isFullscreen = true
        isScreenBright = true
        val w = WebHost.create(this)
        w.addJavascriptInterface(RiwaqBridge(this, w), "Riwaq")
        setContentView(w)
        w.loadUrl(WebHost.PAGE + "#screen=saver")
        web = w
    }

    override fun onDetachedFromWindow() {
        web?.destroy()
        web = null
        super.onDetachedFromWindow()
    }
}
