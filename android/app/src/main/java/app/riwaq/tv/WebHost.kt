package app.riwaq.tv

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.net.Uri
import android.view.View
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader
import java.io.ByteArrayInputStream

/**
 * يجهز WebView يعرض صفحة رواق من داخل التطبيق (بدون نت).
 * - الصفحة تنفتح من https://appassets.androidplatform.net/assets/web/ (مو file://) عشان تشتغل fetch و localStorage.
 * - /icons/... ترجع صور التطبيقات المركّبة.
 * - ممنوع تنتقل لأي موقع ثاني: الجسر (window.Riwaq) لصفحتنا بس.
 */
object WebHost {
    const val ORIGIN = "https://appassets.androidplatform.net"
    const val PAGE = "$ORIGIN/assets/web/index.html"
    /** أقدم نسخة تشتغل فيها الصفحة (inset و gap في flex). أقل منها: شاشة سوداء، فنعرض شاشة أصلية بدلها */
    const val MIN_WEBVIEW = 87

    fun webViewMajor(): Int = WebView.getCurrentWebViewPackage()?.versionName?.substringBefore('.')?.toIntOrNull() ?: 0
    fun tooOld(): Boolean = webViewMajor().let { it in 1 until MIN_WEBVIEW }

    /** onGone: محرك الصفحة مات (ذاكرة الجهاز خلصت). نرجع true عشان التطبيق كله وخدمة الأزرار ما يموتون معه */
    @SuppressLint("SetJavaScriptEnabled")
    fun create(ctx: Context, onGone: () -> Unit = {}): WebView {
        val web = WebView(ctx)
        web.setBackgroundColor(Color.BLACK)
        web.isFocusable = true
        web.isFocusableInTouchMode = true
        web.overScrollMode = View.OVER_SCROLL_NEVER
        web.isVerticalScrollBarEnabled = false
        web.isHorizontalScrollBarEnabled = false

        val s = web.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.allowFileAccess = false
        s.allowContentAccess = false
        s.mediaPlaybackRequiresUserGesture = true
        s.cacheMode = WebSettings.LOAD_DEFAULT
        s.setSupportZoom(false)

        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(ctx))
            .addPathHandler("/album/") { path ->
                // صور ألبوم البيت من مجلد التطبيق الخاص (أرقام بس)
                val m = ALBUM.matchEntire(path) ?: return@addPathHandler null
                val file = Album.file(ctx, m.groupValues[1])
                if (file.exists()) WebResourceResponse("image/jpeg", null, file.inputStream()) else null
            }
            .addPathHandler("/icons/") { path ->
                // path = "banner/<pkg>.png" أو "icon/<pkg>.png"
                val m = ICON.matchEntire(path) ?: return@addPathHandler null
                val bytes = Apps.imagePng(ctx, m.groupValues[1], m.groupValues[2]) ?: return@addPathHandler null
                WebResourceResponse("image/png", null, ByteArrayInputStream(bytes))
            }
            .build()

        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                !isOurs(request.url)

            override fun onRenderProcessGone(view: WebView, detail: android.webkit.RenderProcessGoneDetail): Boolean {
                onGone()
                return true
            }
        }
        return web
    }

    fun isOurs(uri: Uri) = uri.scheme == "https" && uri.host == "appassets.androidplatform.net"

    private val ALBUM = Regex("^(\\d{1,2})\\.jpg$")
    private val ICON = Regex("^(banner|icon)/([A-Za-z0-9_.]{1,200})\\.png$")
}
