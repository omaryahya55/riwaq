package app.riwaq.tv

import android.content.Context
import android.view.InputDevice
import android.view.KeyEvent

/**
 * أزرار التطبيقات في الريموت (نتفلكس، يوتيوب، برايم…).
 * في Google TV واجهة الشركة هي اللي تفتح التطبيق لما تضغط زره، ولما طفيناها صارت الأزرار ما تسوي شي.
 * كل ريموت يرسل أرقام مختلفة لهالأزرار، فما نخمّن: أول ضغطة على زر ما نعرفه تطلع قائمة التطبيقات
 * (فوق اللي أنت فيه)، تختار مرة وحدة، وبعدها الزر يفتح التطبيق على طول. ضغطة مطوّلة على الزر نفسه تغيّره.
 * نحفظ بس: رقم الزر ← اسم التطبيق (على الجهاز نفسه).
 */
object RemoteKeys {
    private const val PREFS = "riwaq.keys"

    // أزرار التطبيقات في أندرويد ١٣ وفوق (VIDEO_APP_1..8، FEATURED_APP_1..4، DEMO_APP_1..4)
    private val APP_RANGE = 289..304
    // أزرار قديمة تستخدمها بعض الريموتات لاختصارات التطبيقات
    private val LEGACY = setOf(
        KeyEvent.KEYCODE_EXPLORER, KeyEvent.KEYCODE_ENVELOPE, KeyEvent.KEYCODE_BOOKMARK,
        KeyEvent.KEYCODE_CONTACTS, KeyEvent.KEYCODE_CALENDAR, KeyEvent.KEYCODE_MUSIC, KeyEvent.KEYCODE_CALCULATOR
    )

    /** رقم الزر لو كان زر تطبيق، وإلا null (الأزرار العادية تمر بدون ما نلمسها) */
    fun id(e: KeyEvent): String? {
        val k = e.keyCode
        return when {
            k in APP_RANGE || k in LEGACY -> "k$k"
            // BUTTON_1..16: زر تطبيق في بعض الريموتات، بس في يد الألعاب زر عادي فنخليه للعبة
            k in KeyEvent.KEYCODE_BUTTON_1..KeyEvent.KEYCODE_BUTTON_16 &&
                !e.isFromSource(InputDevice.SOURCE_GAMEPAD) && !e.isFromSource(InputDevice.SOURCE_JOYSTICK) -> "k$k"
            // زر بدون رقم في أندرويد (بعض الريموتات): نعرفه برقمه في الريموت نفسه
            k == KeyEvent.KEYCODE_UNKNOWN && e.scanCode > 0 -> "s${e.scanCode}"
            else -> null
        }
    }

    fun app(ctx: Context, id: String): String? = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(id, null)

    fun set(ctx: Context, id: String, pkg: String) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(id, pkg).apply()
    }
}
