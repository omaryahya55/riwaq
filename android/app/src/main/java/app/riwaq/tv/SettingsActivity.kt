package app.riwaq.tv

import android.app.Activity
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import java.net.Inet4Address
import java.net.NetworkInterface

/**
 * شاشة الإعدادات على التلفزيون: باركود يفتح صفحة الإعدادات في الجوال.
 * ما فيه كتابة بالريموت. السيرفر يقفل أول ما تطلع من الشاشة.
 */
class SettingsActivity : Activity() {

    private var server: ConfigServer? = null
    private lateinit var status: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.rgb(10, 11, 16))
            layoutDirection = View.LAYOUT_DIRECTION_RTL
            setPadding(dp(64), dp(48), dp(64), dp(48))
        }
        val text = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_VERTICAL or Gravity.START }
        val qr = ImageView(this)

        fun tv(s: String, size: Float, color: Int, bold: Boolean = false) = TextView(this).apply {
            this.text = s
            setTextSize(TypedValue.COMPLEX_UNIT_SP, size)
            setTextColor(color)
            if (bold) typeface = Typeface.DEFAULT_BOLD
            textDirection = View.TEXT_DIRECTION_RTL
            setPadding(0, dp(6), 0, dp(6))
        }

        val gold = Color.rgb(232, 194, 122)
        val ink = Color.rgb(247, 242, 232)
        val ink2 = Color.argb(190, 247, 242, 232)
        text.addView(tv(getString(R.string.settings_title), 34f, gold, true))
        status = tv("", 22f, ink2)

        val ip = localIp()
        val srv = ConfigServer(this) { runOnUiThread { status.text = getString(R.string.settings_saved) } }
        if (ip == null || !srv.start()) {
            text.addView(tv(getString(R.string.settings_no_network), 24f, ink))
        } else {
            server = srv
            val url = "http://$ip:${srv.port}/settings.html?token=${srv.token}"
            text.addView(tv(getString(R.string.settings_scan), 28f, ink))
            text.addView(tv(getString(R.string.settings_hint), 20f, ink2))
            text.addView(tv("http://$ip:${srv.port}", 20f, ink2).apply { textDirection = View.TEXT_DIRECTION_LTR })
            qr.setImageBitmap(qrBitmap(url, dp(380)))
            root.addView(qr, LinearLayout.LayoutParams(dp(380), dp(380)).apply { marginEnd = dp(56) })
        }
        text.addView(status)
        text.addView(tv(getString(R.string.settings_back), 20f, ink2))
        root.addView(text, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        setContentView(root)
    }

    override fun onDestroy() {
        server?.stop()
        server = null
        super.onDestroy()
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun qrBitmap(content: String, size: Int): Bitmap {
        val hints = mapOf(EncodeHintType.MARGIN to 2, EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M)
        val m = QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, size, size, hints)
        val px = IntArray(size * size)
        for (y in 0 until size) for (x in 0 until size) px[y * size + x] = if (m[x, y]) Color.BLACK else Color.WHITE
        return Bitmap.createBitmap(px, size, size, Bitmap.Config.ARGB_8888)
    }

    /** عنوان التلفزيون على شبكة البيت (IPv4 خاص) */
    private fun localIp(): String? = try {
        NetworkInterface.getNetworkInterfaces().toList()
            .filter { it.isUp && !it.isLoopback && !it.isVirtual }
            .flatMap { it.inetAddresses.toList() }
            .filterIsInstance<Inet4Address>()
            .firstOrNull { it.isSiteLocalAddress }?.hostAddress
    } catch (e: Exception) { null }
}
