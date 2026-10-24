package app.riwaq.tv

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ResolveInfo
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.media.tv.TvContract
import android.media.tv.TvInputManager
import android.net.Uri
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream

/**
 * التطبيقات المركّبة ومداخل التلفزيون (HDMI والقنوات).
 * ما نقرا إلا التطبيقات اللي لها أيقونة تشغيل، وما نحتاج صلاحية QUERY_ALL_PACKAGES.
 */
object Apps {

    private fun launchables(pm: PackageManager): List<ResolveInfo> {
        val tv = pm.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LEANBACK_LAUNCHER), 0)
        val phone = pm.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0)
        // تطبيقات التلفزيون أول، وبعدها تطبيقات الجوال اللي ما لها نسخة تلفزيون
        return (tv + phone).distinctBy { it.activityInfo.packageName }
    }

    /** JSON: [{ id, name, banner?, icon? }]. الصور تنطلب من /icons/... (WebHost) */
    fun listJson(ctx: Context): String {
        val pm = ctx.packageManager
        val out = JSONArray()
        launchables(pm)
            .filter { it.activityInfo.packageName != ctx.packageName }
            .sortedBy { it.loadLabel(pm).toString().lowercase() }
            .forEach { ri ->
                val pkg = ri.activityInfo.packageName
                val o = JSONObject()
                o.put("id", pkg)
                o.put("name", ri.loadLabel(pm).toString())
                val hasBanner = ri.activityInfo.banner != 0 || ri.activityInfo.applicationInfo.banner != 0
                if (hasBanner) o.put("banner", "/icons/banner/$pkg.png") else o.put("icon", "/icons/icon/$pkg.png")
                out.put(o)
            }
        return out.toString()
    }

    /** صورة التطبيق PNG (بانر 320×180 أو أيقونة 144×144) */
    fun imagePng(ctx: Context, kind: String, pkg: String): ByteArray? {
        val pm = ctx.packageManager
        val ri = launchables(pm).firstOrNull { it.activityInfo.packageName == pkg } ?: return null
        val d: Drawable? = if (kind == "banner") (ri.activityInfo.loadBanner(pm) ?: ri.activityInfo.applicationInfo.loadBanner(pm)) else ri.loadIcon(pm)
        d ?: return null
        val (w, h) = if (kind == "banner") 320 to 180 else 144 to 144
        val bmp = if (d is BitmapDrawable && d.bitmap != null && d.bitmap.width == w && d.bitmap.height == h) d.bitmap else {
            val b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            val c = Canvas(b)
            d.setBounds(0, 0, w, h)
            d.draw(c)
            b
        }
        val bos = ByteArrayOutputStream()
        bmp.compress(Bitmap.CompressFormat.PNG, 100, bos)
        return bos.toByteArray()
    }

    fun launch(ctx: Context, pkg: String): Boolean {
        val pm = ctx.packageManager
        val i = pm.getLeanbackLaunchIntentForPackage(pkg) ?: pm.getLaunchIntentForPackage(pkg) ?: return false
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
        return try { ctx.startActivity(i); true } catch (e: Exception) { false }
    }

    /** مداخل التلفزيون. في جهاز مثل Xiaomi TV Box ما فيه مداخل، فالقائمة فاضية والصف يختفي */
    fun inputsJson(ctx: Context): String {
        val out = JSONArray()
        val tim = ctx.getSystemService(Context.TV_INPUT_SERVICE) as? TvInputManager ?: return "[]"
        try {
            tim.tvInputList.forEach { info ->
                val label = info.loadLabel(ctx).toString()
                val o = JSONObject()
                o.put("id", info.id)
                o.put("name", label)
                o.put("icon", if (info.type == android.media.tv.TvInputInfo.TYPE_TUNER) "tv" else "hdmi")
                out.put(o)
            }
        } catch (e: Exception) { /* بعض الأجهزة ترفض: نرجع قائمة فاضية */ }
        return out.toString()
    }

    fun openInput(ctx: Context, inputId: String): Boolean {
        val uri: Uri = TvContract.buildChannelUriForPassthroughInput(inputId)
        val i = Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return try { ctx.startActivity(i); true } catch (e: Exception) { false }
    }
}
