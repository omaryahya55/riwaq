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
 * - الصفحة تحسب أوقات الصلاة (adhan-js) لثلاث أيام وترسلها هنا (RiwaqBridge.scheduleAdhan)
 * - أندرويد يحط منبّه لأقرب أذان، ويرجع يحطه بعد إعادة تشغيل الجهاز
 * - وقت الأذان: لو الشاشة شغالة، يشتغل الأذان والبرامج الثانية توقف لين يخلص. زر الرجوع يوقفه
 * - لو التلفزيون مطفي (نايم): ما يطلع صوت
 */
object AdhanScheduler {
    private const val PREFS = "riwaq.adhan"
    private const val KEY = "schedule"
    const val ACTION_ADHAN = "app.riwaq.tv.ADHAN"
    private val NAMES = setOf("الفجر", "الظهر", "العصر", "المغرب", "العشاء")

    /** يقبل قائمة [{at: وقت بالملّي ثانية, name: اسم الصلاة}] من الصفحة، بعد ما يتأكد منها */
    fun save(ctx: Context, json: String): Boolean {
        if (json.length > 8_000) return false
        val arr = try { JSONArray(json) } catch (e: Exception) { return false }
        val now = System.currentTimeMillis()
        val clean = JSONArray()
        for (i in 0 until minOf(arr.length(), 20)) {
            val o = arr.optJSONObject(i) ?: continue
            val at = o.optLong("at", 0)
            val name = o.optString("name", "")
            // بس أوقات خلال الأيام الأربع الجاية، وأسماء الصلوات المعروفة
            if (at <= now || at > now + 4 * 86_400_000L || name !in NAMES) continue
            clean.put(JSONObject().put("at", at).put("name", name))
        }
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, clean.toString()).apply()
        scheduleNext(ctx)
        return true
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
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) AdhanScheduler.scheduleNext(ctx)
    }
}

class AdhanService : Service() {
    private var player: MediaPlayer? = null
    private var focus: AudioFocusRequest? = null

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
        player = MediaPlayer.create(this, R.raw.adhan, attrs, am.generateAudioSessionId())?.apply {
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

        fun stop(ctx: Context) {
            if (playing) ctx.startService(Intent(ctx, AdhanService::class.java).setAction(ACTION_STOP))
        }
    }
}
