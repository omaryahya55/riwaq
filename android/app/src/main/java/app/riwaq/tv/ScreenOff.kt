package app.riwaq.tv

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings

/**
 * إطفاء الشاشة بوقت يحدده صاحبها، مثل المنبّه: مرة وحدة (بعد مدة)، أو كل يوم بنفس الساعة.
 * الصفحة تحسب الوقت وتسلّمه هنا، والمنبّه يشتغل حتى لو التطبيق مو مفتوح.
 * الإطفاء الفعلي بالترتيب: خدمة إمكانية الوصول (النسخة الكاملة)، ثم تصحيح الأخطاء لو شغال،
 * وإلا نعتّم شاشة رواق (وبدون "إبقاء الشاشة"، فالجهاز ينام بوقته).
 */
object ScreenOff {
    const val ACTION = "app.riwaq.tv.SCREEN_OFF"
    private const val DAY = 86_400_000L

    private fun pi(ctx: Context, slot: Int, at: Long, daily: Boolean) = PendingIntent.getBroadcast(
        ctx, 30 + slot,
        Intent(ctx, ScreenOffReceiver::class.java).setAction(ACTION).putExtra("slot", slot).putExtra("at", at).putExtra("daily", daily),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    /** slot: ٠ = اليومي من الإعدادات، ١ = المؤقت من التلفزيون. at <= الحين يلغي */
    fun set(ctx: Context, slot: Int, at: Long, daily: Boolean) {
        if (slot !in 0..1) return
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        if (at <= System.currentTimeMillis()) { am.cancel(pi(ctx, slot, 0, false)); return }
        val intent = pi(ctx, slot, at, daily)
        val exact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()
        if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent)
        else am.setWindow(AlarmManager.RTC_WAKEUP, at, 60_000L, intent)
    }

    fun fired(ctx: Context, slot: Int, at: Long, daily: Boolean) {
        if (daily && at > 0) set(ctx, slot, at + DAY, true)
        now(ctx)
    }

    fun now(ctx: Context) {
        Tilawa.command(ctx, TilawaService.ACTION_STOP)
        if (AdhanService.playing) AdhanService.stop(ctx)
        if (HomeKeyService.instance?.lockScreen() == true) return
        Thread {
            val ok = try { SelfAdb(ctx).use { it.shell("input keyevent 223") }; true } catch (e: Exception) { false }
            if (!ok) Handler(Looper.getMainLooper()).post { MainActivity.live?.dark() }
        }.start()
    }
}

class ScreenOffReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, i: Intent) {
        if (i.action != ScreenOff.ACTION) return
        ScreenOff.fired(c.applicationContext, i.getIntExtra("slot", 0), i.getLongExtra("at", 0L), i.getBooleanExtra("daily", false))
    }
}

/**
 * شاشة التوقف: لو منحنا الجهاز صلاحية الإعدادات الآمنة (مرة وحدة من خطوة القفل)، نرجّع رواق كشاشة توقف
 * كل ما يتغير. بعض أجهزة Google TV ترجّع "الوضع المحيط" حقها بعد التحديثات أو إعادة التشغيل.
 */
object DreamGuard {
    fun ensure(ctx: Context) {
        try {
            if (ctx.checkSelfPermission("android.permission.WRITE_SECURE_SETTINGS") != PackageManager.PERMISSION_GRANTED) return
            val cr = ctx.contentResolver
            if (Settings.Secure.getString(cr, "screensaver_components")?.contains("RiwaqDream") != true)
                Settings.Secure.putString(cr, "screensaver_components", "${ctx.packageName}/.RiwaqDream")
            if (Settings.Secure.getInt(cr, "screensaver_enabled", 0) != 1) Settings.Secure.putInt(cr, "screensaver_enabled", 1)
        } catch (e: Exception) { /* ما نكسر التطبيق عشانها */ }
    }
}
