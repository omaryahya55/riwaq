package app.riwaq.tv

import android.accessibilityservice.AccessibilityService
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.accessibility.AccessibilityEvent

/**
 * ضغطة البيت المطوّلة: في Google TV كانت تفتح القائمة الجانبية حقت واجهة الشركة (اللي طفّيناها).
 * زر البيت محجوز لأندرويد وما يوصل للتطبيقات، فنستقبله بخدمة "إمكانية الوصول" (نفس طريقة تطبيقات
 * تخصيص أزرار الريموت):
 *  - ضغطة عادية: نرجعها لأندرويد كما هي (زر البيت يشتغل عادي)
 *  - ضغطة مطوّلة: تفتح اللوحة السريعة فوق التطبيق المفتوح (QuickPanel)، بدون ما تطلعك منه
 * ما نقرا ولا نحفظ أي شي ثاني: كل الأزرار غير البيت تمر بدون ما نلمسها، وما نستقبل أحداث الشاشة.
 * تنشغل من سكربت التركيب (tools/setup-tv.ps1) وتنطفي من سكربت الرجوع.
 * ملاحظة للاختبار: أوامر "adb shell input keyevent" ما تمر على هذي الخدمة، لازم الريموت الحقيقي
 * (تأكدنا على Xiaomi TV Box S: أزرار الريموت كلها توصل، ومنها البيت).
 */
class HomeKeyService : AccessibilityService() {

    private val handler = Handler(Looper.getMainLooper())
    private var longFired = false
    private var down = false

    private val panel by lazy { QuickPanel(this) }

    private val longPress = Runnable {
        longFired = true
        panel.toggle()
    }

    override fun onKeyEvent(event: KeyEvent): Boolean {
        if (event.keyCode != KeyEvent.KEYCODE_HOME) return false
        when (event.action) {
            KeyEvent.ACTION_DOWN -> if (event.repeatCount == 0) {
                down = true
                longFired = false
                handler.postDelayed(longPress, LONG_PRESS_MS)
            } else if (event.isLongPress && down && !longFired) {
                // أندرويد نفسه علّم الضغطة إنها مطوّلة (الزر مضغوط ويتكرر): نفتح اللوحة على طول
                handler.removeCallbacks(longPress)
                longPress.run()
            }
            KeyEvent.ACTION_UP -> {
                handler.removeCallbacks(longPress)
                if (down && !longFired && !event.isCanceled) {
                    panel.hide()
                    performGlobalAction(GLOBAL_ACTION_HOME)
                }
                down = false
            }
        }
        return true
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}

    override fun onInterrupt() {
        handler.removeCallbacks(longPress)
        down = false
    }

    override fun onDestroy() {
        panel.hide()
        super.onDestroy()
    }

    companion object {
        private const val LONG_PRESS_MS = 600L
    }
}
