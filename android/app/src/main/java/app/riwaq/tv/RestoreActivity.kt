package app.riwaq.tv

import android.app.Activity
import android.app.role.RoleManager
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.StateListDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast

/**
 * الرجوع للواجهة الأصلية من التلفزيون نفسه (بدون كمبيوتر)، بخطوات آمنة:
 *  ١. تشغيل واجهة الشركة: أندرويد ما يسمح لأي تطبيق يشغّل تطبيق نظام بنفسه، فنفتح صفحته في الإعدادات
 *     والمستخدم يضغط "تفعيل"
 *  ٢. اختيار شاشة التوقف الأصلية
 *  ٣. إيقاف رواق كواجهة رئيسية (HomeAlias) وخدمة زر البيت. هذي الخطوة ما تنفتح إلا بعد ما تشتغل واجهة
 *     الشركة، عشان التلفزيون ما يبقى بدون واجهة أبداً
 * رواق نفسه يبقى تطبيق عادي، ومنه "رجوع لرواق" يرجعه الواجهة الرئيسية.
 */
class RestoreActivity : Activity() {

    private lateinit var list: LinearLayout
    private val gold = Color.rgb(232, 194, 122)
    private val ink = Color.rgb(247, 242, 232)
    private val ink2 = Color.argb(190, 247, 242, 232)
    private val ok = Color.rgb(120, 210, 150)
    private val warn = Color.rgb(240, 150, 120)
    private var h = 1080f

    private val alias get() = ComponentName(this, "$packageName.HomeAlias")
    private val riwaqIsHome get() = packageManager.getComponentEnabledSetting(alias) != PackageManager.COMPONENT_ENABLED_STATE_DISABLED

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val dm = resources.displayMetrics
        h = minOf(dm.widthPixels, dm.heightPixels).toFloat()
        list = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutDirection = View.LAYOUT_DIRECTION_RTL
            setPadding(px(0.08f), px(0.05f), px(0.08f), px(0.05f))
        }
        setContentView(ScrollView(this).apply {
            setBackgroundColor(Color.rgb(10, 11, 16))
            isFillViewport = true
            addView(list)
        })
    }

    // كل مرة ترجع للصفحة (بعد ما فعّلت واجهة الشركة مثلاً) نحدّث الحالة
    override fun onResume() {
        super.onResume()
        render()
    }

    private fun px(f: Float) = (h * f).toInt()

    private fun text(s: String, f: Float, color: Int, bold: Boolean = false) = TextView(this).apply {
        text = s
        setTextSize(TypedValue.COMPLEX_UNIT_PX, h * f)
        setTextColor(color)
        if (bold) typeface = Typeface.DEFAULT_BOLD
        textDirection = View.TEXT_DIRECTION_RTL
        setPadding(0, px(0.008f), 0, px(0.008f))
    }

    private fun button(label: String, enabled: Boolean = true, onClick: () -> Unit) = TextView(this).apply {
        text = label
        setTextSize(TypedValue.COMPLEX_UNIT_PX, h * 0.03f)
        textDirection = View.TEXT_DIRECTION_RTL
        gravity = Gravity.CENTER_VERTICAL or Gravity.START
        setPadding(px(0.025f), px(0.014f), px(0.025f), px(0.016f))
        isFocusable = enabled; isClickable = enabled
        setTextColor(if (enabled) ColorStateList(arrayOf(intArrayOf(android.R.attr.state_focused), intArrayOf()), intArrayOf(Color.rgb(30, 22, 8), ink))
            else ColorStateList.valueOf(Color.argb(90, 247, 242, 232)))
        background = StateListDrawable().apply {
            addState(intArrayOf(android.R.attr.state_focused), GradientDrawable().apply { setColor(gold); cornerRadius = h * 0.016f })
            addState(intArrayOf(), GradientDrawable().apply { setColor(Color.argb(28, 255, 255, 255)); cornerRadius = h * 0.016f })
        }
        if (enabled) setOnClickListener { onClick() }
    }

    private fun add(v: View, top: Float = 0.012f) {
        list.addView(v, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = px(top) })
    }

    /** واجهات الشركة الموجودة على الجهاز: (الاسم، شغالة؟) */
    private fun stockHomes(): List<Pair<String, Boolean>> = STOCK.mapNotNull { pkg ->
        try {
            val ai = packageManager.getApplicationInfo(pkg, PackageManager.MATCH_DISABLED_COMPONENTS)
            pkg to ai.enabled
        } catch (e: PackageManager.NameNotFoundException) { null }
    }

    private fun realHomeOn(homes: List<Pair<String, Boolean>>): Boolean {
        val real = homes.filter { it.first != SETUP }
        return if (real.isEmpty()) homes.any { it.second } else real.any { it.second }
    }

    private fun render() {
        list.removeAllViews()
        var firstFocus: View? = null
        add(text("الرجوع للواجهة الأصلية", 0.05f, gold, true), 0f)
        add(text("خطوات آمنة: التلفزيون ما يبقى بدون واجهة. رواق يبقى تطبيق عادي، وتقدر ترجع له من هنا.", 0.024f, ink2))

        val homes = stockHomes()
        val main = homes.firstOrNull { it.first == STOCK[0] } ?: homes.firstOrNull()
        // "إعداد Google TV" مو واجهة حقيقية: لازم وحدة من الواجهات الحقيقية تكون شغالة
        val anyStockOn = realHomeOn(homes)

        if (riwaqIsHome) {
            // ١. واجهة الشركة
            add(text("١. شغّل واجهة الشركة", 0.032f, ink, true), 0.03f)
            if (homes.isEmpty()) add(text("ما لقينا واجهة الشركة على هذا الجهاز. ارجع لها بالكمبيوتر (tools/restore-tv.ps1).", 0.022f, warn))
            for ((pkg, on) in homes) {
                val name = NAMES[pkg] ?: pkg
                if (on) add(text("✓ $name شغالة", 0.024f, ok))
                else add(button("افتح صفحة «$name» واضغط «تفعيل»") { openAppDetails(pkg) }.also { if (firstFocus == null) firstFocus = it })
            }
            // ٢. شاشة التوقف
            add(text("٢. اختر شاشة التوقف الأصلية (اختياري)", 0.032f, ink, true), 0.03f)
            add(button("افتح إعدادات شاشة التوقف") { openDreamSettings() }.also { if (firstFocus == null && anyStockOn) firstFocus = it })
            // ٣. إيقاف رواق
            add(text("٣. وقّف رواق كواجهة رئيسية", 0.032f, ink, true), 0.03f)
            if (!anyStockOn) add(text("هذي الخطوة تنفتح بعد ما تشغّل واجهة الشركة (الخطوة ١)", 0.022f, warn))
            add(button("رجّع الواجهة الأصلية الحين", enabled = anyStockOn) { stopBeingHome() }.also { if (anyStockOn && firstFocus == null) firstFocus = it })
        } else {
            add(text("✓ رواق مو الواجهة الرئيسية الحين. زر البيت يفتح ${main?.let { NAMES[it.first] } ?: "الواجهة الأصلية"}.", 0.026f, ok), 0.03f)
            add(button("رجوع لرواق (يصير الواجهة الرئيسية)") { becomeHome() }.also { firstFocus = it }, 0.03f)
            add(button("حذف تطبيق رواق") { uninstall() }, 0.012f)
            add(text("الحذف اختياري. قبل الحذف تأكد إن زر البيت يفتح الواجهة الأصلية.", 0.02f, ink2))
        }
        add(button("رجوع") { finish() }.also { if (firstFocus == null) firstFocus = it }, 0.04f)
        firstFocus?.requestFocus()
    }

    private fun openAppDetails(pkg: String) {
        val i = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$pkg")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try { startActivity(i) } catch (e: Exception) {
            try { startActivity(Intent(Settings.ACTION_MANAGE_ALL_APPLICATIONS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (e2: Exception) {
                Toast.makeText(this, "من إعدادات التلفزيون ← التطبيقات ← تطبيقات النظام", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun openDreamSettings() {
        try { startActivity(Intent(Settings.ACTION_DREAM_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (e: Exception) {
            try { startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (e2: Exception) { }
            Toast.makeText(this, "من إعدادات التلفزيون ← النظام ← شاشة التوقف", Toast.LENGTH_LONG).show()
        }
    }

    private fun stopBeingHome() {
        // أمان: ما نوقف رواق إلا وفيه واجهة ثانية شغالة
        if (!realHomeOn(stockHomes())) { render(); return }
        packageManager.setComponentEnabledSetting(alias, PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP)
        @Suppress("DEPRECATION") try { packageManager.clearPackagePreferredActivities(packageName) } catch (e: Exception) { }
        HomeKeyService.instance?.disableSelf()
        Toast.makeText(this, "رجعت الواجهة الأصلية ✓", Toast.LENGTH_LONG).show()
        startActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        finish()
    }

    private fun becomeHome() {
        packageManager.setComponentEnabledSetting(alias, PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP)
        // أندرويد ١٠ وفوق: نطلب من النظام يخلي رواق الواجهة الافتراضية (يطلع سؤال للمستخدم)
        if (Build.VERSION.SDK_INT >= 29) {
            val rm = getSystemService(RoleManager::class.java)
            if (rm != null && rm.isRoleAvailable(RoleManager.ROLE_HOME) && !rm.isRoleHeld(RoleManager.ROLE_HOME)) {
                try { startActivityForResult(rm.createRequestRoleIntent(RoleManager.ROLE_HOME), 7); return } catch (e: Exception) { }
            }
        }
        Toast.makeText(this, "اضغط زر البيت. لو سألك، اختر رواق (دائماً)", Toast.LENGTH_LONG).show()
        render()
    }

    @Deprecated("نتيجة طلب الواجهة الافتراضية")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        @Suppress("DEPRECATION") super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == 7) {
            Toast.makeText(this, if (resultCode == RESULT_OK) "رواق رجع الواجهة الرئيسية ✓" else "اضغط زر البيت واختر رواق", Toast.LENGTH_LONG).show()
            render()
        }
    }

    private fun uninstall() {
        try { startActivity(Intent(Intent.ACTION_DELETE, Uri.parse("package:$packageName")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (e: Exception) {
            openAppDetails(packageName)
        }
    }

    companion object {
        private const val SETUP = "com.google.android.tungsten.setupwraith"
        // نفس قائمة سكربت التركيب
        private val STOCK = listOf(
            "com.google.android.apps.tv.launcherx", "com.google.android.tungsten.setupwraith",
            "com.google.android.tvlauncher", "com.mitv.tvhome"
        )
        private val NAMES = mapOf(
            "com.google.android.apps.tv.launcherx" to "واجهة Google TV",
            "com.google.android.tungsten.setupwraith" to "إعداد Google TV",
            "com.google.android.tvlauncher" to "واجهة Android TV",
            "com.mitv.tvhome" to "واجهة شاومي"
        )
    }
}
