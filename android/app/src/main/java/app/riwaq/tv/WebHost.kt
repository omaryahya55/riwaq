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

    @SuppressLint("SetJavaScriptEnabled")
    fun create(ctx: Context): WebView {
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
        }
        return web
    }

    fun isOurs(uri: Uri) = uri.scheme == "https" && uri.host == "appassets.androidplatform.net"

    private val ICON = Regex("^(banner|icon)/([A-Za-z0-9_.]{1,200})\\.png$")
}
