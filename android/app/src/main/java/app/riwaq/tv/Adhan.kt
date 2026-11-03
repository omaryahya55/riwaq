package app.riwaq.tv

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.widget.Toast
import org.json.JSONArray
import org.json.JSONObject

/**
 * صوت الأذان وقت الصلاة (اختيار صاحب المشروع: دايماً والتلفزيون شغال، كل الصلوات إلا الفجر).
 * - الصفحة تحسب أوقات الصلاة (adhan-js) لثلاثين يوم وترسلها هنا (RiwaqBridge.scheduleAdhan)
 * - أندرويد يحط منبّه لأقرب أذان، ويرجع يحطه بعد إعادة تشغيل الجهاز
 * - وقت الأذان: لو الشاشة شغالة، يشتغل الأذان والبرامج الثانية توقف لين يخلص. زر الرجوع يوقفه
 * - لو التلفزيون مطفي (نايم): ما يطلع صوت
 */
object AdhanScheduler {
    private const val PREFS = "riwaq.adhan"
    private const val KEY = "schedule"
    const val ACTION_ADHAN = "app.riwaq.tv.ADHAN"
    private val NAMES = setOf("الفجر", "الظهر", "الجمعة", "العصر", "المغرب", "العشاء")
    private const val MAX_DAYS = 31
    private const val MAX_ITEMS = 160
    // جهاز بدون بطارية ساعة ممكن يقلع بوقت قديم قبل النت: جدول من هذا الوقت غلط، وما نحفظه
    private const val SANE_NOW = 1_767_225_600_000L // 2026-01-01

    /** يقبل قائمة [{at: وقت بالملّي ثانية, name: اسم الصلاة}] من الصفحة، بعد ما يتأكد منها */
    fun save(ctx: Context, json: String): Boolean {
        if (json.length > 16_000) return false
        val arr = try { JSONArray(json) } catch (e: Exception) { return false }
        val now = System.currentTimeMillis()
        if (now < SANE_NOW) return false
        val clean = JSONArray()
        for (i in 0 until minOf(arr.length(), MAX_ITEMS)) {
            val o = arr.optJSONObject(i) ?: continue
            val at = o.optLong("at", 0)
            val name = o.optString("name", "")
            // بس أوقات خلال الشهر الجاي، وأسماء الصلوات المعروفة
            if (at <= now || at > now + MAX_DAYS * 86_400_000L || name !in NAMES) continue
            clean.put(JSONObject().put("at", at).put("name", name))
        }
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, clean.toString()).apply()
        scheduleNext(ctx)
        return true
    }

    /** كم يوم باقي في الجدول المحفوظ (يطلع تنبيه في قائمة التحكم لو أقل من أسبوع) */
    fun daysLeft(ctx: Context): Int {
        val arr = try { JSONArray(ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "[]")) } catch (e: Exception) { JSONArray() }
        var last = 0L
        for (i in 0 until arr.length()) last = maxOf(last, arr.optJSONObject(i)?.optLong("at", 0) ?: 0)
        return ((last - System.currentTimeMillis()) / 86_400_000L).toInt().coerceAtLeast(0)
    }

    fun scheduleNext(ctx: Context) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pi = { name: String, at: Long ->
            PendingIntent.getBroadcast(ctx, 7, Intent(ctx, AdhanReceiver::class.java).setAction(ACTION_ADHAN)
                .putExtra("name", name).putExtra("at", at), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }
        am.cancel(pi("", 0))
        val arr = try { JSONArray(ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "[]")) } catch (e: Exception) { JSONArray() }
        val now = System.currentTimeMillis()
        var next: JSONObject? = null
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            if (o.getLong("at") > now + 1000 && (next == null || o.getLong("at") < next.getLong("at"))) next = o
        }
        next ?: return
        val at = next.getLong("at")
        val intent = pi(next.getString("name"), at)
        val exact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()
        if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent)
        else am.setWindow(AlarmManager.RTC_WAKEUP, at, 60_000L, intent) // بدون صلاحية التوقيت الدقيق: خلال دقيقة
    }
}

/**
 * صوت الأذان: الافتراضي (تسجيل برخصة حرة داخل التطبيق)، أو صوت يرفعه المستخدم من جواله (صفحة الإعدادات).
 * نقبل ملفات صوت حقيقية بس (نشيك أول البايتات)، ولين ١٠ ميجا، وينحفظ داخل التطبيق بس.
 */
object AdhanAudio {
    const val MAX_BYTES = 10 * 1024 * 1024
    // صوت عام، وصوت خاص بالفجر اختياري (فيه «الصلاة خير من النوم»)
    private fun file(ctx: Context, fajr: Boolean = false) = java.io.File(ctx.filesDir, if (fajr) "adhan_fajr" else "adhan_custom")

    fun hasCustom(ctx: Context, fajr: Boolean = false) = file(ctx, fajr).let { it.exists() && it.length() > 0 }
    /** للفجر: صوته لو فيه، وإلا الصوت العام */
    fun customPath(ctx: Context, fajr: Boolean = false): String? =
        (if (fajr) file(ctx, true).takeIf { it.exists() && it.length() > 0 } else null)?.absolutePath
            ?: file(ctx).takeIf { it.exists() && it.length() > 0 }?.absolutePath

    fun save(ctx: Context, bytes: ByteArray, fajr: Boolean = false): Boolean {
        if (bytes.size < 1024 || !isAudio(bytes)) return false
        val tmp = java.io.File(ctx.filesDir, "adhan_custom.tmp")
        tmp.writeBytes(bytes)
        val target = file(ctx, fajr)
        return tmp.renameTo(target) || run { target.writeBytes(bytes); tmp.delete(); true }
    }

    fun clear(ctx: Context, fajr: Boolean = false) { file(ctx, fajr).delete() }

    // MP3 (ID3 أو بداية إطار)، OGG، M4A/AAC (ftyp)، WAV، FLAC، AAC ADTS
    private fun isAudio(b: ByteArray): Boolean {
        fun at(i: Int, s: String) = s.indices.all { b.size > i + it && b[i + it] == s[it].code.toByte() }
        val u = { i: Int -> b[i].toInt() and 0xFF }
        return at(0, "ID3") || (u(0) == 0xFF && (u(1) and 0xE0) == 0xE0) || at(0, "OggS") || at(4, "ftyp") ||
            (at(0, "RIFF") && at(8, "WAVE")) || at(0, "fLaC")
    }
}

class AdhanReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action == AdhanScheduler.ACTION_ADHAN) {
            val at = intent.getLongExtra("at", 0)
            val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
            // الشاشة شغالة، والمنبّه مو متأخر (لو الجهاز كان نايم وصحى بعد بكثير ما نأذّن متأخر)
            if (pm.isInteractive && System.currentTimeMillis() - at < 3 * 60_000L) {
                val s = Intent(ctx, AdhanService::class.java).putExtra("name", intent.getStringExtra("name") ?: "")
                try {
                    if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(s) else ctx.startService(s)
                } catch (e: Exception) { /* النظام رفض (نادر): نكمل على الأذان الجاي */ }
            }
        }
        AdhanScheduler.scheduleNext(ctx) // المنبّه الجاي
    }
}

/** بعد إعادة تشغيل الجهاز: نرجع نحط منبّه الأذان الجاي (بس هذا، ما يشغّل أذان) */
class AdhanBootReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED, Intent.ACTION_TIME_CHANGED, Intent.ACTION_TIMEZONE_CHANGED -> AdhanScheduler.scheduleNext(ctx)
        }
    }
}

class AdhanService : Service() {
    private var player: MediaPlayer? = null
    private var focus: AudioFocusRequest? = null
    private var savedVolume = -1

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) { stopAdhan(); return START_NOT_STICKY }
        val name = intent?.getStringExtra("name").orEmpty()
        startAsForeground(name)
        if (player != null) return START_NOT_STICKY
        val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val attrs = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
        // البرامج الثانية توقف وقت الأذان، وترجع بعده
        if (Build.VERSION.SDK_INT >= 26) {
            focus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT).setAudioAttributes(attrs).setOnAudioFocusChangeListener { }.build()
            am.requestAudioFocus(focus!!)
        } else {
            @Suppress("DEPRECATION") am.requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
        }
        // مستوى صوت الأذان من إعدادات صاحب الشاشة (٠ = بدون تغيير). نرجّع مستواه بعد الأذان
        val want = try { org.json.JSONObject(ConfigStore.get(this)).optInt("adhanVolume", 0) } catch (e: Exception) { 0 }
        if (want in 1..100) {
            savedVolume = am.getStreamVolume(AudioManager.STREAM_MUSIC)
            am.setStreamVolume(AudioManager.STREAM_MUSIC, Math.round(am.getStreamMaxVolume(AudioManager.STREAM_MUSIC) * want / 100f).coerceAtLeast(1), 0)
        }
        // صوت المستخدم لو رفع واحد (وإلا أو لو خرب: الافتراضي)
        player = (AdhanAudio.customPath(this, name == "الفجر")?.let { path ->
            try {
                MediaPlayer().apply { setAudioAttributes(attrs); setDataSource(path); prepare() }
            } catch (e: Exception) { null }
        } ?: MediaPlayer.create(this, R.raw.adhan, attrs, am.generateAudioSessionId()))?.apply {
            setOnCompletionListener { stopAdhan() }
            start()
        }
        if (player == null) { stopAdhan(); return START_NOT_STICKY }
        playing = true
        Toast.makeText(this, if (name.isNotEmpty()) "حان الآن وقت صلاة $name · رجوع: إيقاف الأذان" else "الأذان · رجوع: إيقاف", Toast.LENGTH_LONG).show()
        return START_NOT_STICKY
    }

    private fun startAsForeground(name: String) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(NotificationChannel(CHANNEL, "الأذان", NotificationManager.IMPORTANCE_LOW))
        val stop = PendingIntent.getService(this, 1, Intent(this, AdhanService::class.java).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE)
        @Suppress("DEPRECATION")
        val n = (if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL) else Notification.Builder(this))
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(if (name.isNotEmpty()) "أذان $name" else "الأذان")
            .setContentText("اضغط لإيقاف الأذان")
            .setContentIntent(stop)
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFY_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        else startForeground(NOTIFY_ID, n)
    }

    private fun stopAdhan() {
        playing = false
        player?.let { try { it.stop() } catch (e: Exception) { }; it.release() }
        player = null
        val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        if (savedVolume >= 0) { try { am.setStreamVolume(AudioManager.STREAM_MUSIC, savedVolume, 0) } catch (e: Exception) { }; savedVolume = -1 }
        if (Build.VERSION.SDK_INT >= 26) focus?.let { am.abandonAudioFocusRequest(it) }
        else @Suppress("DEPRECATION") am.abandonAudioFocus(null)
        focus = null
        @Suppress("DEPRECATION") stopForeground(true)
        stopSelf()
    }

    override fun onDestroy() {
        if (player != null) stopAdhan()
        super.onDestroy()
    }

    companion object {
        const val ACTION_STOP = "app.riwaq.tv.ADHAN_STOP"
        private const val CHANNEL = "adhan"
        private const val NOTIFY_ID = 21
        @Volatile var playing = false

        /** تجربة الصوت من صفحة الإعدادات (التطبيق ظاهر وقتها) */
        fun test(ctx: Context, fajr: Boolean = false) {
            val s = Intent(ctx, AdhanService::class.java).putExtra("name", if (fajr) "الفجر" else "")
            try { if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(s) else ctx.startService(s) } catch (e: Exception) { }
        }

        fun stop(ctx: Context) {
            if (playing) ctx.startService(Intent(ctx, AdhanService::class.java).setAction(ACTION_STOP))
        }
    }
}
