package app.riwaq.tv

import android.content.Context
import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.URLDecoder
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.concurrent.Executors

/**
 * سيرفر صغير على شبكة البيت، يشتغل بس وشاشة الإعدادات مفتوحة.
 * يقدّم صفحة الإعدادات للجوال، ويقرا ويحفظ الإعدادات.
 * الأمان:
 * - رمز عشوائي جديد كل مرة تنفتح الشاشة، ولازم يكون في كل طلب للإعدادات (يجي من الباركود)
 * - ملفات محددة بس (قائمة ثابتة)، فما أحد يقدر يطلب ملف ثاني من التطبيق
 * - حدود للحجم والوقت، وما يخزن شي غير الإعدادات
 */
class ConfigServer(private val ctx: Context, private val onSaved: () -> Unit) {

    val token: String = ByteArray(16).also { SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it) }
    var port = 0
        private set

    private var server: ServerSocket? = null
    private val pool = Executors.newFixedThreadPool(4)

    private val files = mapOf(
        "/settings.html" to "text/html; charset=utf-8",
        "/css/settings.css" to "text/css; charset=utf-8",
        "/js/config.js" to "application/javascript; charset=utf-8",
        "/js/teams-ar.js" to "application/javascript; charset=utf-8",
        "/js/settings.js" to "application/javascript; charset=utf-8",
        "/js/quran-meta.js" to "application/javascript; charset=utf-8",
        "/js/news-sources.js" to "application/javascript; charset=utf-8",
        "/js/demo-data.js" to "application/javascript; charset=utf-8",
        "/css/fonts.css" to "text/css; charset=utf-8",
        "/content/approved.json" to "application/json; charset=utf-8",
        "/content/candidates/hadeethenc.json" to "application/json; charset=utf-8",
        "/fonts/amiri/Amiri-Regular.ttf" to "font/ttf",
        "/fonts/amiri/Amiri-Bold.ttf" to "font/ttf",
        "/fonts/plex/IBMPlexSansArabic-Regular.ttf" to "font/ttf",
        "/fonts/plex/IBMPlexSansArabic-Medium.ttf" to "font/ttf",
        "/fonts/plex/IBMPlexSansArabic-SemiBold.ttf" to "font/ttf",
        "/fonts/plex/IBMPlexSansArabic-Bold.ttf" to "font/ttf"
    )

    fun start(): Boolean {
        for (p in PORTS) {
            try {
                val s = ServerSocket()
                s.reuseAddress = true
                s.bind(InetSocketAddress(p))
                server = s
                port = p
                Thread({ acceptLoop(s) }, "riwaq-config").apply { isDaemon = true }.start()
                return true
            } catch (e: Exception) { /* المنفذ مشغول: نجرب اللي بعده */ }
        }
        return false
    }

    fun stop() {
        try { server?.close() } catch (e: Exception) { }
        server = null
        pool.shutdownNow()
    }

    private fun acceptLoop(s: ServerSocket) {
        while (!s.isClosed) {
            val c = try { s.accept() } catch (e: Exception) { break }
            pool.execute { handle(c) }
        }
    }

    private fun handle(c: Socket) {
        c.use { sock ->
            try {
                sock.soTimeout = 10000
                val input = BufferedInputStream(sock.getInputStream())
                val out = sock.getOutputStream()
                val head = readHead(input) ?: return send(out, 400, "text/plain", "bad request".toByteArray())
                val lines = head.split("\r\n")
                val parts = lines[0].split(" ")
                if (parts.size < 2) return send(out, 400, "text/plain", "bad request".toByteArray())
                val method = parts[0]
                val target = parts[1]
                val path = target.substringBefore("?")
                val query = target.substringAfter("?", "")
                val headers = lines.drop(1).mapNotNull { l ->
                    val i = l.indexOf(':'); if (i > 0) l.substring(0, i).trim().lowercase() to l.substring(i + 1).trim() else null
                }.toMap()

                if (path == "/" ) return redirect(out, "/settings.html")
                if (path == "/api/apps") {
                    // أسماء التطبيقات المركّبة (لاختيار التطبيقات المقفلة من الجوال). بالرمز بس
                    if (!tokenOk(query)) return send(out, 403, "text/plain", "forbidden".toByteArray())
                    if (method != "GET") return send(out, 405, "text/plain", "method".toByteArray())
                    return send(out, 200, "application/json; charset=utf-8", Apps.listJson(ctx).toByteArray())
                }
                if (path == "/api/config") {
                    if (!tokenOk(query)) return send(out, 403, "text/plain", "forbidden".toByteArray())
                    when (method) {
                        "GET" -> return send(out, 200, "application/json; charset=utf-8", ConfigStore.get(ctx).toByteArray())
                        "POST" -> {
                            val len = headers["content-length"]?.toIntOrNull() ?: return send(out, 411, "text/plain", "length required".toByteArray())
                            if (len <= 0 || len > MAX_BODY) return send(out, 413, "text/plain", "too large".toByteArray())
                            val body = readBody(input, len) ?: return send(out, 400, "text/plain", "bad body".toByteArray())
                            if (!ConfigStore.set(ctx, String(body, Charsets.UTF_8))) return send(out, 400, "text/plain", "invalid".toByteArray())
                            onSaved()
                            return send(out, 200, "application/json", "{\"ok\":true}".toByteArray())
                        }
                        else -> return send(out, 405, "text/plain", "method".toByteArray())
                    }
                }
                val type = files[path]
                if (method == "GET" && type != null) {
                    // الملف ممكن ما يكون موجود (مثل ملف المحتوى المرشح): نرد 404 بدل ما ينقطع الاتصال
                    val bytes = try { ctx.assets.open("web$path").use { it.readBytes() } } catch (e: java.io.IOException) { null }
                    return if (bytes != null) send(out, 200, type, bytes) else send(out, 404, "text/plain", "not found".toByteArray())
                }
                send(out, 404, "text/plain", "not found".toByteArray())
            } catch (e: Exception) { /* اتصال انقطع: نتجاهله */ }
        }
    }

    private fun tokenOk(query: String): Boolean {
        val given = query.split("&").firstOrNull { it.startsWith("token=") }?.substringAfter("=")
            ?.let { URLDecoder.decode(it, "UTF-8") } ?: return false
        // مقارنة بوقت ثابت عشان ما ينعرف الرمز من سرعة الرد
        return MessageDigest.isEqual(given.toByteArray(), token.toByteArray())
    }

    private fun readHead(input: InputStream): String? {
        val buf = ByteArrayOutputStream()
        var last4 = 0
        while (buf.size() < MAX_HEAD) {
            val b = input.read()
            if (b < 0) return null
            buf.write(b)
            last4 = (last4 shl 8) or b
            if (last4 == 0x0D0A0D0A) return String(buf.toByteArray(), Charsets.ISO_8859_1).trimEnd()
        }
        return null
    }

    private fun readBody(input: InputStream, len: Int): ByteArray? {
        val b = ByteArray(len)
        var got = 0
        while (got < len) {
            val n = input.read(b, got, len - got)
            if (n < 0) return null
            got += n
        }
        return b
    }

    private fun send(out: OutputStream, code: Int, type: String, body: ByteArray) {
        val reason = mapOf(200 to "OK", 302 to "Found", 400 to "Bad Request", 403 to "Forbidden", 404 to "Not Found",
            405 to "Method Not Allowed", 411 to "Length Required", 413 to "Payload Too Large")[code] ?: "Error"
        val h = "HTTP/1.1 $code $reason\r\nContent-Type: $type\r\nContent-Length: ${body.size}\r\n" +
            "Cache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\n\r\n"
        out.write(h.toByteArray(Charsets.ISO_8859_1))
        out.write(body)
        out.flush()
    }

    private fun redirect(out: OutputStream, to: String) {
        val h = "HTTP/1.1 302 Found\r\nLocation: $to\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
        out.write(h.toByteArray(Charsets.ISO_8859_1)); out.flush()
    }

    companion object {
        private val PORTS = listOf(8765, 8766, 8767, 8768, 8769)
        private const val MAX_HEAD = 8 * 1024
        private const val MAX_BODY = 64 * 1024
    }
}
