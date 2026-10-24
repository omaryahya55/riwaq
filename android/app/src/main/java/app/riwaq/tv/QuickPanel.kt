package app.riwaq.tv

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.StateListDrawable
import android.icu.text.SimpleDateFormat
import android.icu.util.ULocale
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import java.util.Date

/**
 * اللوحة السريعة الجانبية (مثل قائمة Google TV): تطلع فوق أي تطبيق مفتوح بدون ما تطلعك منه.
 * نافذة "إمكانية الوصول" (TYPE_ACCESSIBILITY_OVERLAY) من HomeKeyService، فما تحتاج أي صلاحية زيادة.
 * الأسهم تتنقل، OK يفتح، ورجوع (أو ضغطة البيت المطوّلة مرة ثانية) يقفلها وترجع لنفس التطبيق.
 */
class QuickPanel(private val svc: AccessibilityService) {

    private val wm = svc.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    private val handler = Handler(Looper.getMainLooper())
    private var root: View? = null
    private val autoClose = Runnable { hide() }

    val isShowing get() = root != null

    private fun dp(v: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), svc.resources.displayMetrics).toInt()

    // نفس خطوط الشاشة (داخل التطبيق)، ولو ما انقرت نرجع لخط النظام
    private fun font(path: String): Typeface = try { Typeface.createFromAsset(svc.assets, path) } catch (e: Exception) { Typeface.DEFAULT }

    private data class Item(val label: String, val action: () -> Unit)

    private fun items() = listOf(
        Item("الواجهة الرئيسية") { svc.performGlobalAction(AccessibilityService.GLOBAL_ACTION_HOME) },
        Item("الواي فاي") { open(Intent(Settings.ACTION_WIFI_SETTINGS)) },
        Item("البلوتوث") { open(Intent(Settings.ACTION_BLUETOOTH_SETTINGS)) },
        Item("الصوت") { open(Intent(Settings.ACTION_SOUND_SETTINGS)) },
        Item("الشاشة") { open(Intent(Settings.ACTION_DISPLAY_SETTINGS)) },
        Item("شاشة الانتظار الحين") { startSaver() },
        Item("إعدادات رواق (من الجوال)") { open(Intent(svc, SettingsActivity::class.java)) },
        Item("كل إعدادات التلفزيون") { open(Intent(Settings.ACTION_SETTINGS)) }
    )

    private fun open(i: Intent) {
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try { svc.startActivity(i) } catch (e: Exception) {
            try { svc.startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (e2: Exception) { }
        }
    }

    // شاشة التوقف حقت النظام (Somnambulator في أندرويد)، وإذا ما فيه: شاشة الانتظار داخل رواق
    private fun startSaver() {
        val dream = Intent(Intent.ACTION_MAIN).setClassName("com.android.systemui", "com.android.systemui.Somnambulator")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try { svc.startActivity(dream) } catch (e: Exception) {
            open(Intent(svc, MainActivity::class.java).setAction(MainActivity.ACTION_SAVER))
        }
    }

    fun toggle() { if (isShowing) hide() else show() }

    fun show() {
        if (root != null) return
        val gold = Color.parseColor("#E8C27A")
        val panel = object : LinearLayout(svc) {
            override fun dispatchKeyEvent(event: KeyEvent): Boolean {
                handler.removeCallbacks(autoClose); handler.postDelayed(autoClose, AUTO_CLOSE_MS)
                if (event.keyCode == KeyEvent.KEYCODE_BACK || event.keyCode == KeyEvent.KEYCODE_MENU) {
                    if (event.action == KeyEvent.ACTION_UP) hide()
                    return true
                }
                return super.dispatchKeyEvent(event)
            }
        }.apply {
            orientation = LinearLayout.VERTICAL
            layoutDirection = View.LAYOUT_DIRECTION_RTL
            setPadding(dp(28), dp(36), dp(28), dp(28))
            background = GradientDrawable().apply { setColor(Color.parseColor("#F2121419")) }
        }

        panel.addView(TextView(svc).apply {
            text = "رِواق"; setTextColor(gold); textSize = 34f; typeface = font("web/fonts/reemkufi/ReemKufi-Variable.ttf")
        })
        val plex = font("web/fonts/plex/IBMPlexSansArabic-Medium.ttf")
        val now = Date()
        val time = SimpleDateFormat("h:mm a", ULocale("ar_SA")).format(now)
        val hijri = SimpleDateFormat("EEEE، d MMMM y", ULocale("ar_SA@calendar=islamic-umalqura")).format(now)
        panel.addView(TextView(svc).apply {
            text = "$time\n$hijri"; setTextColor(Color.parseColor("#C9CAD3")); textSize = 15f; typeface = plex
            setPadding(0, dp(4), 0, dp(18))
        })

        val textColors = ColorStateList(
            arrayOf(intArrayOf(android.R.attr.state_focused), intArrayOf()),
            intArrayOf(Color.parseColor("#1E1608"), Color.parseColor("#F1F1F4"))
        )
        var first: View? = null
        for (it in items()) {
            val tv = TextView(svc).apply {
                text = it.label; textSize = 19f; typeface = plex; setTextColor(textColors)
                gravity = Gravity.CENTER_VERTICAL or Gravity.START
                setPadding(dp(18), dp(12), dp(18), dp(14))
                isFocusable = true; isClickable = true
                background = StateListDrawable().apply {
                    addState(intArrayOf(android.R.attr.state_focused), GradientDrawable().apply { setColor(gold); cornerRadius = dp(14).toFloat() })
                    addState(intArrayOf(), GradientDrawable().apply { setColor(Color.TRANSPARENT) })
                }
                val act = it.action
                setOnClickListener { hide(); act() }
            }
            panel.addView(tv, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(4) })
            if (first == null) first = tv
        }
        panel.addView(TextView(svc).apply {
            text = "رجوع: إغلاق"; setTextColor(Color.parseColor("#8A8C98")); textSize = 13f; typeface = plex
            setPadding(dp(4), dp(18), 0, 0)
        })

        val lp = WindowManager.LayoutParams(
            dp(340), ViewGroup.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or WindowManager.LayoutParams.FLAG_DIM_BEHIND,
            PixelFormat.TRANSLUCENT
        ).apply { gravity = Gravity.RIGHT or Gravity.TOP; dimAmount = 0.35f }
        try {
            wm.addView(panel, lp)
        } catch (e: Exception) {
            // ما قدرنا نرسم فوق التطبيق: نفتح اللوحة داخل رواق بدلها
            open(Intent(svc, MainActivity::class.java).setAction(MainActivity.ACTION_QUICK))
            return
        }
        root = panel
        panel.translationX = dp(340).toFloat()
        panel.animate().translationX(0f).setDuration(220).start()
        first?.requestFocus()
        handler.postDelayed(autoClose, AUTO_CLOSE_MS)
    }

    fun hide() {
        handler.removeCallbacks(autoClose)
        val v = root ?: return
        root = null
        try { wm.removeView(v) } catch (e: Exception) { }
    }

    companion object {
        private const val AUTO_CLOSE_MS = 30_000L
    }
}
