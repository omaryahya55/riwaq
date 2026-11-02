package app.riwaq.tv

import android.app.Activity
import android.app.AlarmManager
import android.app.role.RoleManager
import android.content.ComponentName
import android.content.Context
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
 * معالج الإعداد (أول تشغيل، ومن اللوحة السريعة): يمشّي المستخدم بالريموت على اللي يحتاجه رواق من النظام،
 * بدون كمبيوتر ولا عنوان IP:
 *  ١. الواجهة الرئيسية: زر البيت يفتح رواق
 *  ٢. خدمة الضغطة المطوّلة وأزرار التطبيقات (إمكانية الوصول): أندرويد ما يسمح لتطبيق يفعّلها بنفسه،
 *     فنفتح صفحتها والمستخدم يضغط "تشغيل"
 *  ٣. الأذان في وقته: صلاحية المنبّه الدقيق (أندرويد ١٢ بس، وغيره تلقائي)
 *  ٤. المدينة: باركود يفتح الإعدادات في الجوال، وبدونها ما تطلع أوقات الصلاة
 * كل خطوة عليها ✓ لما تتم، والصفحة تحدّث حالتها كل ما ترجع لها. ما نطفي واجهة الشركة (اختياري، من السكربت).
 */
class SetupActivity : Activity() {

    private lateinit var list: LinearLayout
    private val gold = Color.rgb(232, 194, 122)
    private val ink = Color.rgb(247, 242, 232)
    private val ink2 = Color.argb(190, 247, 242, 232)
    private val ok = Color.rgb(120, 210, 150)
    private val warn = Color.rgb(240, 150, 120)
    private var h = 1080f

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val dm = resources.displayMetrics
        h = minOf(dm.widthPixels, dm.heightPixels).toFloat()
        list = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutDirection = View.LAYOUT_DIRECTION_RTL
            setPadding(px(0.08f), px(0.025f), px(0.08f), px(0.025f))
        }
        setContentView(ScrollView(this).apply {
            setBackgroundColor(Color.rgb(10, 11, 16))
            isFillViewport = true
            addView(list)
        })
    }

    // كل مرة نرجع للصفحة (بعد ما فعّل المستخدم شي من الإعدادات) نحدّث الحالة
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
        setPadding(0, px(0.004f), 0, px(0.004f))
    }

    private fun button(label: String, onClick: () -> Unit) = TextView(this).apply {
        text = label
        setTextSize(TypedValue.COMPLEX_UNIT_PX, h * 0.03f)
        textDirection = View.TEXT_DIRECTION_RTL
        gravity = Gravity.CENTER_VERTICAL or Gravity.START
        setPadding(px(0.025f), px(0.009f), px(0.025f), px(0.011f))
        isFocusable = true; isClickable = true
        setTextColor(ColorStateList(arrayOf(intArrayOf(android.R.attr.state_focused), intArrayOf()), intArrayOf(Color.rgb(30, 22, 8), ink)))
        background = StateListDrawable().apply {
            addState(intArrayOf(android.R.attr.state_focused), GradientDrawable().apply { setColor(gold); cornerRadius = h * 0.016f })
            addState(intArrayOf(), GradientDrawable().apply { setColor(Color.argb(28, 255, 255, 255)); cornerRadius = h * 0.016f })
        }
        setOnClickListener { onClick() }
    }

    private fun add(v: View, top: Float = 0.012f) {
        list.addView(v, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = px(top) })
    }

    private fun render() {
        list.removeAllViews()
        var firstFocus: View? = null
        val homeOk = isHome(this)
        val a11yOk = a11yOn(this)
        val hasKeys = BuildConfig.HAS_KEYS
        val alarmOk = alarmOk(this)
        val city = cityName(this)
        val ready = homeOk && (a11yOk || !hasKeys) && alarmOk && city.isNotEmpty()

        add(text("إعداد رِواق", 0.042f, gold, true), 0f)
        add(text(if (ready) "كل شي جاهز ✓" else "أربع خطوات سريعة بالريموت (كل خطوة تفتح صفحتها، وترجع هنا بزر الرجوع).", 0.024f, if (ready) ok else ink2))

        // ١. الواجهة الرئيسية
        add(text("١. خله الواجهة الرئيسية", 0.03f, ink, true), 0.016f)
        if (homeOk) add(text("✓ زر البيت يفتح رواق", 0.024f, ok))
        else {
            add(text("عشان زر البيت يفتح رواق بدل واجهة الشركة.", 0.022f, ink2))
            add(button("اجعل رواق الواجهة الرئيسية") { becomeHome() }.also { if (firstFocus == null) firstFocus = it })
        }

        // ٢. الضغطة المطوّلة وأزرار الريموت (النسخة الكاملة بس)
        if (!hasKeys) {
            add(text("٢. الضغطة المطوّلة وأزرار الريموت", 0.03f, ink, true), 0.016f)
            add(text("مو موجودة في هذي النسخة الخفيفة (قوقل تحظر تركيبها من خارج المتجر). تحتاج النسخة الكاملة، وشرحها في صفحة رواق على GitHub.", 0.022f, ink2))
        } else {
        add(text("٢. فعّل الضغطة المطوّلة وأزرار الريموت", 0.03f, ink, true), 0.016f)
        if (a11yOk) add(text("✓ شغّالة (البيت المطوّل يفتح اللوحة السريعة، وأزرار نتفلكس ويوتيوب تفتح تطبيقاتها)", 0.024f, ok))
        else {
            add(text("افتح الصفحة، اختر «رِواق» ثم اضغط «تشغيل». الخدمة ما تقرا ولا تحفظ أي شي غير أزرار الريموت.", 0.022f, ink2))
            add(button("افتح صفحة خدمات إمكانية الوصول") { openAccessibility() }.also { if (firstFocus == null) firstFocus = it })
            if (Build.VERSION.SDK_INT >= 33) {
                add(text("لو الخيار رمادي ومكتوب «إعداد مقيّد»: افتح معلومات رواق ← ⋮ ← «السماح بالإعدادات المقيّدة»، وارجع.", 0.02f, warn))
                add(button("افتح معلومات تطبيق رواق") { openAppDetails() })
            }
        }

        }

        // ٣. الأذان
        add(text("٣. الأذان في وقته", 0.03f, ink, true), 0.016f)
        if (alarmOk) add(text("✓ الأذان بتوقيت دقيق", 0.024f, ok))
        else {
            add(text("اسمح لرواق بالمنبّهات والتذكيرات عشان يطلع الأذان بالضبط.", 0.022f, ink2))
            add(button("افتح إذن المنبّهات") { openAlarmPermission() }.also { if (firstFocus == null) firstFocus = it })
        }

        // ٤. المدينة. الزر يطلع بس لو ما فيه مدينة: المعالج ينفتح من اللوحة السريعة، وما يصير طريق للإعدادات يتخطى رمز القفل
        add(text("٤. اختر مدينتك", 0.03f, ink, true), 0.016f)
        if (city.isNotEmpty()) add(text("✓ $city", 0.024f, ok))
        else if (hasPin(this)) add(text("اختر المدينة من «التحكم» ← «إعدادات رواق» بعد ما تكتب الرمز.", 0.022f, ink2))
        else {
            add(text("عشان تطلع أوقات الصلاة والطقس. تصوّر الباركود بجوالك، تختار المدينة، وتضغط حفظ.", 0.022f, ink2))
            add(button("اعرض الباركود") {
                startActivity(Intent(this, SettingsActivity::class.java).putExtra(SettingsActivity.EXTRA_CITY, true))
            }.also { if (firstFocus == null) firstFocus = it })
        }

        add(button(if (ready) "ابدأ ✓" else "تخطّى (أقدر أرجع لها من اللوحة السريعة)") { finishSetup() }.also { if (firstFocus == null || ready) firstFocus = it }, 0.02f)
        firstFocus?.requestFocus()
    }

    private fun becomeHome() {
        packageManager.setComponentEnabledSetting(ComponentName(this, "$packageName.HomeAlias"), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP)
        if (Build.VERSION.SDK_INT >= 29) {
            val rm = getSystemService(RoleManager::class.java)
            if (rm != null && rm.isRoleAvailable(RoleManager.ROLE_HOME) && !rm.isRoleHeld(RoleManager.ROLE_HOME)) {
                try { startActivityForResult(rm.createRequestRoleIntent(RoleManager.ROLE_HOME), 7); return } catch (e: Exception) { }
            }
        }
        Toast.makeText(this, "اضغط زر البيت. لو سألك، اختر رواق (دائماً)", Toast.LENGTH_LONG).show()
    }

    @Deprecated("نتيجة طلب الواجهة الافتراضية")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        @Suppress("DEPRECATION") super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == 7) render()
    }

    private fun openAccessibility() {
        try { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) } catch (e: Exception) {
            try { startActivity(Intent(Settings.ACTION_SETTINGS)) } catch (e2: Exception) { }
            Toast.makeText(this, "من إعدادات التلفزيون ← إمكانية الوصول ← رِواق", Toast.LENGTH_LONG).show()
        }
    }

    private fun openAppDetails() {
        try { startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))) } catch (e: Exception) {
            Toast.makeText(this, "من إعدادات التلفزيون ← التطبيقات ← رِواق", Toast.LENGTH_LONG).show()
        }
    }

    private fun openAlarmPermission() {
        if (Build.VERSION.SDK_INT >= 31) {
            try { startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:$packageName"))); return } catch (e: Exception) { }
        }
        openAppDetails()
    }

    private fun finishSetup() {
        getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_DONE, true).apply()
        finish()
    }

    companion object {
        private const val PREFS = "riwaq.setup"
        private const val KEY_DONE = "done"

        fun isDone(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_DONE, false)

        private fun config(ctx: Context) = try { org.json.JSONObject(ConfigStore.get(ctx)) } catch (e: Exception) { org.json.JSONObject() }

        /** اسم المدينة من الإعدادات. فاضي = لسا ما اختار */
        fun cityName(ctx: Context): String = config(ctx).optJSONObject("city")?.optString("name").orEmpty()

        private fun hasPin(ctx: Context) = config(ctx).optJSONObject("lock")?.optString("pin").orEmpty().isNotEmpty()

        fun isHome(ctx: Context): Boolean {
            if (Build.VERSION.SDK_INT >= 29) {
                val rm = ctx.getSystemService(RoleManager::class.java)
                if (rm != null && rm.isRoleAvailable(RoleManager.ROLE_HOME)) return rm.isRoleHeld(RoleManager.ROLE_HOME)
            }
            val ri = ctx.packageManager.resolveActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), PackageManager.MATCH_DEFAULT_ONLY)
            return ri?.activityInfo?.packageName == ctx.packageName
        }

        fun a11yOn(ctx: Context): Boolean {
            val on = Settings.Secure.getString(ctx.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
            return on.split(':').any { it.equals("${ctx.packageName}/${ctx.packageName}.HomeKeyService", true) }
        }

        /**
         * أندرويد ممكن يوقف خدمة الأزرار بعد تحديث التطبيق: كانت شغالة والحين لا.
         * ما نقدر نشغلها بدون المستخدم، فالواجهة تنبّه وتفتح هذا المعالج.
         */
        fun keysLost(ctx: Context): Boolean {
            if (!BuildConfig.HAS_KEYS) return false
            val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            if (a11yOn(ctx)) { p.edit().putBoolean("keysWereOn", true).apply(); return false }
            return p.getBoolean("keysWereOn", false)
        }

        fun alarmOk(ctx: Context): Boolean {
            if (Build.VERSION.SDK_INT < 31) return true
            return (ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager).canScheduleExactAlarms()
        }

        /** أول تشغيل: نفتح المعالج لو فيه خطوة ناقصة (مرة وحدة، لين المستخدم يضغط "ابدأ" أو "تخطّى") */
        fun maybeLaunch(act: Activity) {
            if (isDone(act) || (isHome(act) && (a11yOn(act) || !BuildConfig.HAS_KEYS) && alarmOk(act) && cityName(act).isNotEmpty())) return
            act.startActivity(Intent(act, SetupActivity::class.java))
        }
    }
}
