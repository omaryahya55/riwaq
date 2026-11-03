package app.riwaq.tv

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioManager
import android.media.AudioPlaybackConfiguration
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.KeyCharacterMap
import android.view.KeyEvent
import android.view.ViewConfiguration
import android.view.accessibility.AccessibilityEvent

/**
 * ضغطة البيت المطوّلة: في Google TV كانت تفتح القائمة الجانبية حقت واجهة الشركة (اللي طفّيناها).
 * زر البيت محجوز لأندرويد وما يوصل للتطبيقات، فنستقبله بخدمة "إمكانية الوصول" (نفس طريقة تطبيقات
 * تخصيص أزرار الريموت):
 *  - ضغطة عادية: نرجعها لأندرويد كما هي (زر البيت يشتغل عادي)
 *  - ضغطة مطوّلة: تفتح اللوحة السريعة فوق التطبيق المفتوح (QuickPanel)، بدون ما تطلعك منه
 *  - زر الإعدادات (⚙) وأزرار التطبيقات (نتفلكس، يوتيوب…): كانت واجهة الشركة هي اللي تشغّلها (RemoteKeys)
 * ما نقرا ولا نحفظ أي شي ثاني: باقي الأزرار تمر بدون ما نلمسها (إلا واللوحة مفتوحة: نتحكم فيها
 * بالأسهم)، وما نستقبل أحداث الشاشة.
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

    /*
     * الضغطة المستمرة (تمسك السهم أو رفع الصوت): أندرويد يوقف تكرار الزر الممسوك لما تكون فيه خدمة
     * تفلتر الأزرار (مثل هذي)، فكانت تنزل خطوة وحدة بس. فنكررها إحنا لين تشيل إصبعك:
     * الأسهم بأمر النظام (أندرويد ١٣ وفوق)، والصوت من مدير الصوت (يوصل للتلفزيون بالـ HDMI مثل الريموت).
     * ولو الجهاز يكرر بنفسه (يجينا تكرار من الريموت)، نوقف تكرارنا عشان ما يصير مرتين.
     * انتبه: في Xiaomi TV Box S النظام يستهلك أزرار الصوت قبل ما توصل هنا، فمسك الصوت ما يرفع إلا خطوة وحدة
     * والفلتر شغال (تأكدنا بالقياس). عشان كذا نطفي الفلتر وقت ما يهم الصوت: شوف refreshFilter.
     */
    private var heldKey = 0
    private var heldDevice = 0
    private val audio by lazy { getSystemService(AUDIO_SERVICE) as AudioManager }
    private val repeatTick = object : Runnable {
        override fun run() {
            val k = heldKey
            if (k == 0 || !repeatStep(k)) { heldKey = 0; return }
            handler.postDelayed(this, if (k in VOLUME_KEYS) VOLUME_REPEAT_MS else maxOf(ViewConfiguration.getKeyRepeatDelay(), 60).toLong())
        }
    }

    private fun trackHold(e: KeyEvent) {
        if (e.keyCode !in DPAD_KEYS && e.keyCode !in VOLUME_KEYS) return
        handler.removeCallbacks(repeatTick)
        heldKey = 0
        if (e.action == KeyEvent.ACTION_DOWN && e.repeatCount == 0) {
            heldKey = e.keyCode
            heldDevice = e.deviceId
            handler.postDelayed(repeatTick, ViewConfiguration.getKeyRepeatTimeout() + 80L)
        }
        // ACTION_UP، أو تكرار من الجهاز نفسه: نوقف
    }

    /** خطوة وحدة من الضغطة المستمرة. false = ما نقدر نكرر هالزر هنا */
    private fun repeatStep(k: Int): Boolean {
        if (k in VOLUME_KEYS) {
            audio.adjustSuggestedStreamVolume(
                if (k == KeyEvent.KEYCODE_VOLUME_UP) AudioManager.ADJUST_RAISE else AudioManager.ADJUST_LOWER,
                AudioManager.USE_DEFAULT_STREAM_TYPE, AudioManager.FLAG_SHOW_UI
            )
            return true
        }
        // اللوحة مفتوحة: التحديد يمشي فيها
        if (panel.isShowing) { panel.handleKey(KeyEvent(KeyEvent.ACTION_DOWN, k)); return true }
        if (Build.VERSION.SDK_INT < 33) return false
        return performGlobalAction(when (k) {
            KeyEvent.KEYCODE_DPAD_UP -> GLOBAL_ACTION_DPAD_UP
            KeyEvent.KEYCODE_DPAD_DOWN -> GLOBAL_ACTION_DPAD_DOWN
            KeyEvent.KEYCODE_DPAD_LEFT -> GLOBAL_ACTION_DPAD_LEFT
            else -> GLOBAL_ACTION_DPAD_RIGHT
        })
    }

    override fun onKeyEvent(event: KeyEvent): Boolean {
        // الأسهم اللي نرسلها إحنا (الضغطة المستمرة): تمر على طول. نعرفها بإنها من غير الريموت الممسوك،
        // أو من الجهاز الافتراضي، أو معلّمة إنها من خدمة إمكانية الوصول (0x800 في أندرويد)
        if (event.deviceId == KeyCharacterMap.VIRTUAL_KEYBOARD || (event.flags and 0x800) != 0 ||
            (heldKey != 0 && event.keyCode == heldKey && event.deviceId != heldDevice)) return false
        trackHold(event)
        // الأذان شغال: زر الرجوع يوقفه (من أي تطبيق)
        if (AdhanService.playing && event.keyCode == KeyEvent.KEYCODE_BACK) {
            if (event.action == KeyEvent.ACTION_UP) AdhanService.stop(this)
            return true
        }
        // اللوحة مفتوحة: الأسهم و OK ورجوع تتحكم فيها (ما توصل للتطبيق اللي تحتها)
        if (event.keyCode != KeyEvent.KEYCODE_HOME && panel.isShowing) return panel.handleKey(event)
        // زر الإعدادات (⚙) في ريموت Google TV كان يفتح لوحة واجهة الشركة: نفتح لوحتنا بداله
        if (event.keyCode == KeyEvent.KEYCODE_SETTINGS) {
            if (event.action == KeyEvent.ACTION_UP) panel.show()
            return true
        }
        // أزرار التطبيقات (نتفلكس، يوتيوب…): نفتح التطبيق المختار للزر
        RemoteKeys.id(event)?.let { appKey(event, it); return true }
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

    // زر تطبيق: ضغطة = يفتح التطبيق (أو يطلب نختار له لو ما اخترنا)، مطوّلة = نغيّر تطبيقه
    private var appDown: String? = null
    private var appLongFired = false
    private val appLong = Runnable { appLongFired = true; appDown?.let { pickApp(it) } }

    private fun appKey(e: KeyEvent, id: String) {
        when (e.action) {
            KeyEvent.ACTION_DOWN -> if (e.repeatCount == 0) {
                appDown = id; appLongFired = false
                handler.postDelayed(appLong, APP_LONG_MS)
            }
            KeyEvent.ACTION_UP -> {
                handler.removeCallbacks(appLong)
                if (appDown == id && !appLongFired && !e.isCanceled) {
                    val pkg = RemoteKeys.app(this, id)
                    if (pkg == null || !Apps.open(this, pkg)) pickApp(id) // ما اخترنا، أو التطبيق انحذف (والمقفل يطلب الرمز)
                }
                appDown = null
            }
        }
    }

    private fun pickApp(id: String) {
        val list = Apps.choices(this).map { (pkg, label) ->
            QuickPanel.Item(label) { RemoteKeys.set(this, id, pkg); Apps.open(this, pkg) }
        }
        panel.hide()
        panel.show("زر التطبيق", "وش يفتح هالزر؟ تختار مرة وحدة، وتقدر تغيّره بضغطة مطوّلة على نفس الزر", list)
    }

    private val playback = object : AudioManager.AudioPlaybackCallback() {
        override fun onPlaybackConfigChanged(configs: MutableList<AudioPlaybackConfiguration>) { refreshSoon() }
    }
    private val refreshNow = Runnable { refreshFilter() }
    private var volumeUntil = 0L
    private val volumeChanged = object : BroadcastReceiver() {
        override fun onReceive(c: Context, i: Intent) {
            volumeUntil = SystemClock.uptimeMillis() + VOLUME_WINDOW_MS
            refreshFilter()
            handler.postDelayed({ refreshFilter() }, VOLUME_WINDOW_MS + 100)
        }
    }

    /** حالة الصوت تحتاج لحظة لين تستقر: نفحص بعد شوي، ومرة ثانية بعدها */
    private fun refreshSoon() {
        handler.removeCallbacks(refreshNow)
        handler.postDelayed(refreshNow, 400)
        handler.postDelayed({ refreshFilter() }, 2000)
    }

    override fun onServiceConnected() {
        instance = this
        panel.onClosed = { refreshFilter() }
        audio.registerAudioPlaybackCallback(playback, handler)
        registerReceiver(volumeChanged, IntentFilter("android.media.VOLUME_CHANGED_ACTION"))
        refreshFilter()
    }

    /**
     * مساران لأزرار الريموت: الفلتر يوقف تكرار الزر الممسوك، وأزرار الصوت ما توصل هنا، وأزرار التطبيقات
     * ما توصل إلا مع الفلتر (تأكدنا بالقياس على Xiaomi TV Box S). فنطفيه وقت ما يهم الصوت:
     *  - فيه صوت شغال (فيديو، تلاوة)، أو غيّرت مستوى الصوت قبل لحظات: بدون فلتر، فالمسك يشتغل عادي
     *  - غير كذا: الفلتر شغال، فأزرار التطبيقات والضغطة المطوّلة توصل
     * واللوحة المفتوحة والأذان (زر الرجوع يوقفه) يحتاجون الفلتر دايماً.
     */
    fun refreshFilter() {
        val forVolume = audio.isMusicActive || SystemClock.uptimeMillis() < volumeUntil
        val want = panel.isShowing || AdhanService.playing || !forVolume
        val info = serviceInfo ?: return
        val has = info.flags and AccessibilityServiceInfo.FLAG_REQUEST_FILTER_KEY_EVENTS != 0
        if (want == has) return
        info.flags = if (want) info.flags or AccessibilityServiceInfo.FLAG_REQUEST_FILTER_KEY_EVENTS
        else info.flags and AccessibilityServiceInfo.FLAG_REQUEST_FILTER_KEY_EVENTS.inv()
        serviceInfo = info
        if (!want) { handler.removeCallbacks(repeatTick); heldKey = 0 }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}

    override fun onInterrupt() {
        handler.removeCallbacks(longPress)
        handler.removeCallbacks(appLong)
        handler.removeCallbacks(repeatTick)
        appDown = null
        heldKey = 0
        down = false
    }

    override fun onDestroy() {
        audio.unregisterAudioPlaybackCallback(playback)
        try { unregisterReceiver(volumeChanged) } catch (e: Exception) { }
        handler.removeCallbacks(refreshNow)
        panel.hide()
        if (instance === this) instance = null
        super.onDestroy()
    }

    companion object {
        private const val LONG_PRESS_MS = 600L
        private const val APP_LONG_MS = 800L
        private const val VOLUME_REPEAT_MS = 120L
        private const val VOLUME_WINDOW_MS = 6000L
        private val DPAD_KEYS = setOf(KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_DPAD_DOWN, KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_DPAD_RIGHT)
        private val VOLUME_KEYS = setOf(KeyEvent.KEYCODE_VOLUME_UP, KeyEvent.KEYCODE_VOLUME_DOWN)
        /** الخدمة الشغالة (لو فيه): صفحة "الرجوع للواجهة الأصلية" تطفيها بـ disableSelf */
        @Volatile var instance: HomeKeyService? = null
    }
}
