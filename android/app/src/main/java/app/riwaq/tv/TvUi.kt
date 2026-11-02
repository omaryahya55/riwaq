package app.riwaq.tv

import android.app.Activity
import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.StateListDrawable
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel

/** عناصر الشاشات الأصلية البسيطة (التحديث، والتقرير، والمجلس، وWebView القديم): المقاسات من طول الشاشة نفسه */
class TvUi(private val act: Activity) {
    val gold = Color.rgb(232, 194, 122)
    val ink = Color.rgb(247, 242, 232)
    val ink2 = Color.argb(200, 247, 242, 232)
    val ok = Color.rgb(120, 210, 150)
    val warn = Color.rgb(240, 150, 120)
    private val h = minOf(act.resources.displayMetrics.widthPixels, act.resources.displayMetrics.heightPixels).toFloat()
    val list: LinearLayout = LinearLayout(act).apply {
        orientation = LinearLayout.VERTICAL
        layoutDirection = View.LAYOUT_DIRECTION_RTL
        setPadding(px(0.08f), px(0.06f), px(0.08f), px(0.06f))
    }

    fun px(f: Float) = (h * f).toInt()

    fun attach() {
        act.setContentView(ScrollView(act).apply {
            setBackgroundColor(Color.rgb(10, 11, 16))
            isFillViewport = true
            addView(list)
        })
    }

    fun text(s: String, f: Float, color: Int, bold: Boolean = false) = TextView(act).apply {
        text = s
        setTextSize(TypedValue.COMPLEX_UNIT_PX, h * f)
        setTextColor(color)
        if (bold) typeface = Typeface.DEFAULT_BOLD
        textDirection = View.TEXT_DIRECTION_RTL
        setPadding(0, px(0.008f), 0, px(0.008f))
    }

    fun button(label: String, onClick: () -> Unit) = TextView(act).apply {
        text = label
        setTextSize(TypedValue.COMPLEX_UNIT_PX, h * 0.03f)
        textDirection = View.TEXT_DIRECTION_RTL
        gravity = Gravity.CENTER_VERTICAL or Gravity.START
        setPadding(px(0.025f), px(0.014f), px(0.025f), px(0.016f))
        isFocusable = true; isClickable = true
        setTextColor(ColorStateList(arrayOf(intArrayOf(android.R.attr.state_focused), intArrayOf()), intArrayOf(Color.rgb(30, 22, 8), ink)))
        background = StateListDrawable().apply {
            addState(intArrayOf(android.R.attr.state_focused), GradientDrawable().apply { setColor(ink); cornerRadius = h * 0.016f })
            addState(intArrayOf(), GradientDrawable().apply { setColor(Color.argb(28, 255, 255, 255)); cornerRadius = h * 0.016f })
        }
        setOnClickListener { onClick() }
    }

    fun add(v: View, top: Float = 0.012f) {
        list.addView(v, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = px(top) })
    }

    companion object {
        fun qr(content: String, size: Int): Bitmap {
            val hints = mapOf(EncodeHintType.MARGIN to 2, EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M, EncodeHintType.CHARACTER_SET to "UTF-8")
            val m = QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, size, size, hints)
            val px = IntArray(size * size)
            for (y in 0 until size) for (x in 0 until size) px[y * size + x] = if (m[x, y]) Color.BLACK else Color.WHITE
            return Bitmap.createBitmap(px, size, size, Bitmap.Config.ARGB_8888)
        }
    }
}
