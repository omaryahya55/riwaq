package app.riwaq.tv

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.tv.TvContract
import org.json.JSONArray
import org.json.JSONObject

/**
 * أكمل المشاهدة: قائمة النظام (Watch Next) اللي تكتب فيها التطبيقات اللي وقفت عندها.
 * قرار صاحب المشروع: اسم وأيقونة بدون صور، عشان ما تطلع صورة ما تناسب قدام العائلة، فما نقرأ أعمدة الصور أصلاً.
 * يعتمد على التطبيق نفسه: اللي ما يكتب في القائمة ما يطلع هنا.
 */
object WatchNext {
    private val COLS = arrayOf(
        TvContract.WatchNextPrograms.COLUMN_PACKAGE_NAME, TvContract.WatchNextPrograms.COLUMN_TITLE,
        TvContract.WatchNextPrograms.COLUMN_EPISODE_TITLE, TvContract.WatchNextPrograms.COLUMN_LAST_PLAYBACK_POSITION_MILLIS,
        TvContract.WatchNextPrograms.COLUMN_DURATION_MILLIS, TvContract.WatchNextPrograms.COLUMN_INTENT_URI,
        TvContract.WatchNextPrograms.COLUMN_BROWSABLE
    )
    private const val MAX = 8

    private class Item(val pkg: String, val title: String, val progress: Int, val link: String?)
    @Volatile private var last: List<Item> = emptyList()

    fun allowed(ctx: Context) = ctx.checkSelfPermission("android.permission.READ_TV_LISTINGS") == PackageManager.PERMISSION_GRANTED

    fun listJson(ctx: Context): String {
        if (!allowed(ctx)) return "[]"
        val out = ArrayList<Item>()
        try {
            ctx.contentResolver.query(TvContract.WatchNextPrograms.CONTENT_URI, COLS, null, null,
                TvContract.WatchNextPrograms.COLUMN_LAST_ENGAGEMENT_TIME_UTC_MILLIS + " DESC")?.use { c ->
                while (c.moveToNext() && out.size < MAX) {
                    if (c.getInt(6) != 1) continue
                    val pkg = c.getString(0) ?: continue
                    // تطبيق محذوف أو مقفل برمز الأهل ما يطلع
                    if (Apps.launchIntent(ctx, pkg) == null || Apps.isLocked(ctx, pkg)) continue
                    val title = listOfNotNull(c.getString(1), c.getString(2)).filter { it.isNotBlank() }.joinToString(" · ").take(70)
                    if (title.isBlank()) continue
                    val pos = c.getLong(3); val dur = c.getLong(4)
                    out += Item(pkg, title, if (dur > 0 && pos > 0) ((pos * 100) / dur).toInt().coerceIn(0, 100) else 0, c.getString(5))
                }
            }
        } catch (e: Exception) { return "[]" } // بعض الأجهزة ترفض القراءة: الصف ما يطلع
        last = out
        val arr = JSONArray()
        out.forEachIndexed { i, it ->
            arr.put(JSONObject().put("i", i).put("pkg", it.pkg).put("title", it.title).put("progress", it.progress)
                .put("icon", "/icons/icon/${it.pkg}.png"))
        }
        return arr.toString()
    }

    /** نفتح العنصر داخل تطبيقه بس: الرابط يجي من تطبيق ثاني، فما نخليه يفتح غير حزمته وما نعطي أي صلاحية */
    fun open(ctx: Context, index: Int): Boolean {
        val it = last.getOrNull(index) ?: return false
        val link = it.link
        if (link != null) {
            try {
                val i = Intent.parseUri(link, Intent.URI_INTENT_SCHEME)
                i.selector = null
                i.setPackage(it.pkg)
                i.removeFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
                    Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION or Intent.FLAG_GRANT_PREFIX_URI_PERMISSION)
                ctx.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                return true
            } catch (e: Exception) { /* الرابط خرب: نفتح التطبيق نفسه */ }
        }
        return Apps.launch(ctx, it.pkg)
    }
}
