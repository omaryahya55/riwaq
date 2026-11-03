package app.riwaq.tv

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.graphics.BitmapFactory
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaMetadata
import android.media.MediaPlayer
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.widget.Toast
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * مسك زر الصوت: خدمة الأزرار تفلتر الريموت، وأندرويد يوقف تكرار الزر الممسوك وقت الفلترة، فالمسك يرفع خطوة وحدة.
 * هذا الخيار يطفي الفلتر. الثمن: أزرار التطبيقات في الريموت والضغطة المطوّلة ما تشتغل لين يرجّعها.
 */
object KeysMode {
    private const val PREFS = "riwaq.keys"
    private const val HOLD = "holdVolume"

    fun holdVolume(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(HOLD, false)

    fun set(ctx: Context, hold: Boolean) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(HOLD, hold).apply()
        HomeKeyService.instance?.setFilter(!hold)
    }
}

/**
 * ألبوم البيت: صور صاحب البيت في شاشة الانتظار. تنحفظ في مجلد التطبيق الخاص بس، وتنحذف مع التطبيق.
 * الجوال يصغّر الصورة وينظفها، وهنا نتأكد إنها JPEG فعلاً وبحدود معقولة (الذاكرة والتخزين).
 */
object Album {
    const val MAX_BYTES = 3 * 1024 * 1024
    const val OK = 0
    const val BAD = 1
    const val FULL = 2
    private const val MAX_COUNT = 10
    private fun dir(ctx: Context) = File(ctx.filesDir, "album").also { it.mkdirs() }

    fun file(ctx: Context, id: String) = File(dir(ctx), "$id.jpg")

    private fun ids(ctx: Context): List<Int> =
        (dir(ctx).list() ?: emptyArray()).mapNotNull { it.removeSuffix(".jpg").toIntOrNull() }.sorted()

    fun listJson(ctx: Context): String = JSONObject().put("ids", JSONArray(ids(ctx))).toString()

    @Synchronized fun save(ctx: Context, bytes: ByteArray): Int {
        if (bytes.size < 1024 || bytes[0] != 0xFF.toByte() || bytes[1] != 0xD8.toByte() || bytes[2] != 0xFF.toByte()) return BAD
        val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, o)
        if (o.outWidth !in 1..3840 || o.outHeight !in 1..2160) return BAD
        val have = ids(ctx)
        if (have.size >= MAX_COUNT) return FULL
        val id = (1..99).first { it !in have }
        val tmp = File(dir(ctx), "$id.tmp")
        tmp.writeBytes(bytes)
        return if (tmp.renameTo(file(ctx, id.toString()))) OK else BAD
    }

    @Synchronized fun delete(ctx: Context, id: String) {
        if (Regex("^\\d{1,2}$").matches(id)) file(ctx, id).delete()
    }
}

/**
 * صورة من عند صاحب البيت لتطبيق يختاره: تاخذ مكان بانر التطبيق في الواجهة، وتنحفظ في مجلد التطبيق الخاص بس.
 * الجوال يقصها لنسبة البانر وينظفها، وهنا نتأكد إنها JPEG بحدود صغيرة.
 */
object AppImages {
    const val MAX_BYTES = 600 * 1024
    private const val MAX_COUNT = 60
    private val PKG = Regex("^[A-Za-z0-9_.]{1,200}$")
    private fun dir(ctx: Context) = File(ctx.filesDir, "appimg").also { it.mkdirs() }

    fun valid(pkg: String) = PKG.matches(pkg)

    fun file(ctx: Context, pkg: String): File? = if (valid(pkg)) File(dir(ctx), "$pkg.jpg") else null

    @Synchronized fun save(ctx: Context, pkg: String, bytes: ByteArray): Int {
        val target = file(ctx, pkg) ?: return Album.BAD
        if (bytes.size < 512 || bytes[0] != 0xFF.toByte() || bytes[1] != 0xD8.toByte() || bytes[2] != 0xFF.toByte()) return Album.BAD
        val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, o)
        if (o.outWidth !in 1..1280 || o.outHeight !in 1..720) return Album.BAD
        if (!target.exists() && (dir(ctx).list()?.size ?: 0) >= MAX_COUNT) return Album.FULL
        val tmp = File(dir(ctx), "$pkg.tmp")
        tmp.writeBytes(bytes)
        return if (tmp.renameTo(target)) Album.OK else Album.BAD
    }

    @Synchronized fun delete(ctx: Context, pkg: String) { file(ctx, pkg)?.delete() }
}

/**
 * تلاوة القرآن: تختار الشيخ والسورة من الصفحة، والصوت يشتغل مباشرة من شبكة mp3quran وما ينحفظ عندنا.
 * (نسخ Islamic Network باقية في الكود بديل جاهز: معرفها بدون /)
 * خدمة أصلية مستقلة عن الصفحة، فتكمل لو انعادت الصفحة. الأذان يوقفها مؤقتاً (تركيز الصوت) وترجع بعده،
 * وتوقف لو انطفت الشاشة عشان ما يبقى صوت في بيت نايم. الرابط يتركب هنا من قيم مفحوصة، مو من الصفحة.
 */
object Tilawa {
    private const val CDN = "https://cdn.islamic.network/quran"
    private const val MP3QURAN = "https://cdn.mp3quran.net/audio"
    private val EDITION = Regex("^[a-z0-9.-]{3,60}(/r\\d{1,2})?$")
    private val RATES = setOf(32, 40, 48, 64, 128, 192)
    private val AYAHS = intArrayOf(7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6)

    // حالة الشاشة: الخدمة تكتبها، والصفحة تقراها بدون ما تلمس المشغّل من خيط ثاني
    @Volatile var on = false
    @Volatile var paused = false
    @Volatile var loading = false
    @Volatile var edition = ""
    @Volatile var surah = 0
    @Volatile var verse = false
    @Volatile var rate = 128
    @Volatile var pos = 0
    @Volatile var dur = 0
    @Volatile var ayah = 0

    fun ayahs(n: Int) = if (n in 1..114) AYAHS[n - 1] else 0
    fun surahUrl(ed: String, r: Int, n: Int) =
        if ('/' in ed) "$MP3QURAN/$ed/${n.toString().padStart(3, '0')}.mp3" else "$CDN/audio-surah/$r/$ed/$n.mp3"
    /** رابط الآية (من صفر داخل السورة). رقمها عندهم من بداية المصحف */
    fun verseUrl(ed: String, r: Int, n: Int, i: Int) = "$CDN/audio/$r/$ed/${AYAHS.take(n - 1).sum() + i + 1}.mp3"

    fun play(ctx: Context, ed: String, n: Int, isVerse: Boolean, r: Int, at: Int) {
        if (!EDITION.matches(ed) || n !in 1..114 || r !in RATES || at < 0) return
        val s = Intent(ctx, TilawaService::class.java).putExtra("edition", ed).putExtra("surah", n)
            .putExtra("verse", isVerse).putExtra("rate", r).putExtra("at", at)
        try { ctx.startForegroundService(s) } catch (e: Exception) { }
    }

    fun command(ctx: Context, action: String) {
        if (on) try { ctx.startService(Intent(ctx, TilawaService::class.java).setAction(action)) } catch (e: Exception) { }
    }

    fun seek(ctx: Context, dir: Int) {
        if (on) try { ctx.startService(Intent(ctx, TilawaService::class.java).setAction(TilawaService.ACTION_SEEK).putExtra("dir", dir)) } catch (e: Exception) { }
    }

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("tilawa", Context.MODE_PRIVATE)

    fun remember(ctx: Context, at: Int) {
        prefs(ctx).edit().putString("edition", edition).putInt("surah", surah).putBoolean("verse", verse).putInt("rate", rate).putInt("at", at).apply()
    }

    fun forget(ctx: Context) { prefs(ctx).edit().clear().apply() }

    fun stateJson(ctx: Context): String {
        val o = JSONObject().put("on", on).put("paused", paused).put("loading", loading).put("edition", edition).put("surah", surah)
            .put("verse", verse).put("pos", pos).put("dur", dur).put("ayah", ayah).put("ayahs", ayahs(surah))
        val p = prefs(ctx)
        if (!on && p.contains("edition")) {
            o.put("last", JSONObject().put("edition", p.getString("edition", "")).put("surah", p.getInt("surah", 0))
                .put("verse", p.getBoolean("verse", false)).put("rate", p.getInt("rate", 128)).put("at", p.getInt("at", 0)))
        }
        return o.toString()
    }
}

class TilawaService : Service(), AudioManager.OnAudioFocusChangeListener {
    private var player: MediaPlayer? = null
    private var next: MediaPlayer? = null
    private var nextReady = false
    private var focus: AudioFocusRequest? = null
    private var prepared = false
    private var lostFocus = false
    private var screenOff: BroadcastReceiver? = null
    private var session: MediaSession? = null
    private val main = Handler(Looper.getMainLooper())
    private var ticks = 0
    private val tick = object : Runnable {
        override fun run() {
            val p = player
            if (p != null && prepared) try {
                Tilawa.pos = p.currentPosition
                Tilawa.dur = p.duration.coerceAtLeast(0)
            } catch (e: Exception) { }
            // نحفظ كل ١٥ ثانية: لو انقطعت الكهربا يبقى مكان نكمل منه
            if (++ticks % 15 == 0) Tilawa.remember(this@TilawaService, currentAt())
            main.postDelayed(this, 1000)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun currentAt() = if (Tilawa.verse) Tilawa.ayah else Tilawa.pos

    private fun attrs() = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> { finishTilawa(); return START_NOT_STICKY }
            ACTION_TOGGLE -> { toggle(); return START_NOT_STICKY }
            ACTION_SEEK -> { seek(intent.getIntExtra("dir", 0)); return START_NOT_STICKY }
        }
        startAsForeground()
        val ed = intent?.getStringExtra("edition")
        if (ed == null) { finishTilawa(); return START_NOT_STICKY }
        Tilawa.edition = ed
        Tilawa.verse = intent.getBooleanExtra("verse", false)
        Tilawa.rate = intent.getIntExtra("rate", 128)
        val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        if (focus == null) {
            val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN).setAudioAttributes(attrs()).setOnAudioFocusChangeListener(this).build()
            focus = req
            am.requestAudioFocus(req)
        }
        if (screenOff == null) {
            screenOff = object : BroadcastReceiver() { override fun onReceive(c: Context, i: Intent) { finishTilawa() } }
            registerReceiver(screenOff, IntentFilter(Intent.ACTION_SCREEN_OFF))
        }
        Tilawa.on = true
        startSession()
        main.removeCallbacks(tick)
        main.post(tick)
        begin(intent.getIntExtra("surah", 1), intent.getIntExtra("at", 0))
        return START_NOT_STICKY
    }

    /**
     * جلسة وسائط: أزرار التشغيل والإيقاف في الريموت توصل للتلاوة من أي مكان، حتى وأنت داخل تطبيق ثاني.
     * والنظام يعرف إن فيه صوت شغال ويعرضه في لوحته.
     */
    private fun startSession() {
        if (session != null) return
        session = MediaSession(this, "riwaq-tilawa").apply {
            setCallback(object : MediaSession.Callback() {
                override fun onPlay() { if (Tilawa.paused) toggle() }
                override fun onPause() { if (!Tilawa.paused) toggle() }
                override fun onStop() { finishTilawa() }
                override fun onSkipToNext() { if (Tilawa.surah < 114) begin(Tilawa.surah + 1, 0) }
                override fun onSkipToPrevious() { if (Tilawa.surah > 1) begin(Tilawa.surah - 1, 0) }
            })
            setMetadata(MediaMetadata.Builder().putString(MediaMetadata.METADATA_KEY_TITLE, "تلاوة القرآن").build())
            isActive = true
        }
        publishState()
    }

    private fun publishState() {
        val state = if (Tilawa.paused) PlaybackState.STATE_PAUSED else PlaybackState.STATE_PLAYING
        session?.setPlaybackState(PlaybackState.Builder()
            .setActions(PlaybackState.ACTION_PLAY or PlaybackState.ACTION_PAUSE or PlaybackState.ACTION_PLAY_PAUSE or PlaybackState.ACTION_STOP or PlaybackState.ACTION_SKIP_TO_NEXT or PlaybackState.ACTION_SKIP_TO_PREVIOUS)
            .setState(state, PlaybackState.PLAYBACK_POSITION_UNKNOWN, 1f).build())
    }

    /** يبدأ سورة: كاملة من موضع (ملي ثانية)، أو آية آية من رقم آية */
    private fun begin(n: Int, at: Int) {
        releasePlayers()
        Tilawa.surah = n
        Tilawa.paused = false
        publishState()
        Tilawa.loading = true
        Tilawa.pos = 0
        Tilawa.dur = 0
        Tilawa.ayah = if (Tilawa.verse) at.coerceIn(0, Tilawa.ayahs(n) - 1) else 0
        val url = if (Tilawa.verse) Tilawa.verseUrl(Tilawa.edition, Tilawa.rate, n, Tilawa.ayah) else Tilawa.surahUrl(Tilawa.edition, Tilawa.rate, n)
        player = create(url) { mp ->
            if (mp === player) {
                prepared = true
                Tilawa.loading = false
                if (!Tilawa.verse && at > 0) mp.seekTo(at)
                if (!Tilawa.paused && !lostFocus) mp.start()
                prepareNext()
            }
        }
    }

    private fun create(url: String, onReady: (MediaPlayer) -> Unit): MediaPlayer? = try {
        MediaPlayer().apply {
            setAudioAttributes(attrs())
            setDataSource(url)
            setOnPreparedListener { onReady(it) }
            setOnErrorListener { mp, _, _ -> onPlayerError(mp); true }
            setOnCompletionListener { onComplete(it) }
            prepareAsync()
        }
    } catch (e: Exception) { fail(); null }

    /** آية آية: نجهز اللي بعدها مقدماً عشان ما يبان فاصل */
    private fun prepareNext() {
        if (!Tilawa.verse || next != null) return
        val i = Tilawa.ayah + 1
        if (i >= Tilawa.ayahs(Tilawa.surah)) return
        nextReady = false
        next = create(Tilawa.verseUrl(Tilawa.edition, Tilawa.rate, Tilawa.surah, i)) { mp ->
            if (mp === player) {
                // الآية السابقة خلصت قبل ما تجهز هذي
                prepared = true
                Tilawa.loading = false
                if (!Tilawa.paused && !lostFocus) mp.start()
                prepareNext()
            } else if (mp === next) {
                nextReady = true
                try { player?.setNextMediaPlayer(mp) } catch (e: Exception) { }
            }
        }
    }

    private fun onComplete(mp: MediaPlayer) {
        if (mp !== player) return
        val following = next
        if (Tilawa.verse && following != null) {
            mp.release()
            player = following
            next = null
            Tilawa.ayah++
            prepared = nextReady
            val ready = nextReady
            nextReady = false
            if (ready) prepareNext() else Tilawa.loading = true
            return
        }
        // آية آية والجاية فشلت قبل: نكمل منها بدل ما نقفز للسورة اللي بعدها
        if (Tilawa.verse && Tilawa.ayah + 1 < Tilawa.ayahs(Tilawa.surah)) { begin(Tilawa.surah, Tilawa.ayah + 1); return }
        // خلصت السورة: اللي بعدها، وبعد آخر سورة نوقف
        if (Tilawa.surah < 114) begin(Tilawa.surah + 1, 0)
        else { Tilawa.forget(this); finishTilawa(remember = false) }
    }

    private fun onPlayerError(mp: MediaPlayer) {
        if (mp === next) {
            // الآية الجاية فشلت: نحاول مرة ثانية لما توصل
            try { mp.release() } catch (e: Exception) { }
            next = null
            nextReady = false
            return
        }
        fail()
    }

    private fun fail() {
        Toast.makeText(this, "التلاوة ما اشتغلت. تأكد من النت وجرّب مرة ثانية", Toast.LENGTH_LONG).show()
        finishTilawa()
    }

    private fun toggle() {
        val p = player ?: return
        if (!prepared) { Tilawa.paused = !Tilawa.paused; publishState(); return }
        if (p.isPlaying) { p.pause(); Tilawa.paused = true; Tilawa.remember(this, currentAt()) }
        else { p.start(); Tilawa.paused = false; lostFocus = false }
        publishState()
    }

    /** تقديم وترجيع: ٣٠ ثانية، أو آية لو التلاوة آية آية */
    private fun seek(dir: Int) {
        if (!prepared) return
        if (Tilawa.verse) {
            val to = Tilawa.ayah + dir
            if (to in 0 until Tilawa.ayahs(Tilawa.surah)) begin(Tilawa.surah, to)
            return
        }
        val p = player ?: return
        p.seekTo((p.currentPosition + dir * 30000).coerceIn(0, p.duration.coerceAtLeast(0)))
    }

    override fun onAudioFocusChange(change: Int) {
        val p = player ?: return
        when (change) {
            // تطبيق ثاني أخذ الصوت (فيديو مثلاً): التلاوة تخلص، ومكانها محفوظ
            AudioManager.AUDIOFOCUS_LOSS -> finishTilawa()
            // الأذان: نوقف ونرجع بعده
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT, AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
                lostFocus = true
                if (prepared && p.isPlaying) p.pause()
            }
            AudioManager.AUDIOFOCUS_GAIN -> {
                val wasLost = lostFocus
                lostFocus = false
                if (wasLost && prepared && !Tilawa.paused && !p.isPlaying) p.start()
            }
        }
    }

    private fun startAsForeground() {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "تلاوة القرآن", NotificationManager.IMPORTANCE_LOW))
        val stop = PendingIntent.getService(this, 2, Intent(this, TilawaService::class.java).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE)
        val n = Notification.Builder(this, CHANNEL).setSmallIcon(R.mipmap.ic_launcher).setContentTitle("تلاوة القرآن")
            .setContentText("اضغط للإيقاف").setContentIntent(stop).setOngoing(true).build()
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFY_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK) else startForeground(NOTIFY_ID, n)
    }

    private fun releasePlayers() {
        for (m in listOf(player, next)) m?.let { try { if (it.isPlaying) it.stop() } catch (e: Exception) { }; try { it.release() } catch (e: Exception) { } }
        player = null
        next = null
        nextReady = false
        prepared = false
    }

    private fun finishTilawa(remember: Boolean = true) {
        if (remember && Tilawa.on && Tilawa.surah > 0) Tilawa.remember(this, currentAt())
        main.removeCallbacks(tick)
        Tilawa.on = false
        Tilawa.paused = false
        Tilawa.loading = false
        releasePlayers()
        session?.let { it.isActive = false; it.release() }
        session = null
        val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        focus?.let { am.abandonAudioFocusRequest(it) }
        focus = null
        screenOff?.let { try { unregisterReceiver(it) } catch (e: Exception) { } }
        screenOff = null
        @Suppress("DEPRECATION") stopForeground(true)
        stopSelf()
    }

    override fun onDestroy() {
        if (Tilawa.on) finishTilawa()
        super.onDestroy()
    }

    companion object {
        const val ACTION_STOP = "app.riwaq.tv.TILAWA_STOP"
        const val ACTION_TOGGLE = "app.riwaq.tv.TILAWA_TOGGLE"
        const val ACTION_SEEK = "app.riwaq.tv.TILAWA_SEEK"
        private const val CHANNEL = "tilawa"
        private const val NOTIFY_ID = 22
    }
}
