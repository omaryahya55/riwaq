package app.riwaq.tv

import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Base64
import java.io.DataInputStream
import java.io.File
import java.io.OutputStream
import java.math.BigInteger
import java.net.InetSocketAddress
import java.net.Socket
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.KeyFactory
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.interfaces.RSAPublicKey
import java.security.spec.PKCS8EncodedKeySpec
import java.security.spec.X509EncodedKeySpec
import javax.crypto.Cipher

/**
 * قفل زر البيت على رواق، بدون كمبيوتر.
 * Google TV يرجّع زر البيت لواجهة الشركة حتى لو رواق هو "الواجهة الافتراضية"، ولا يوجد طريق غير:
 *  - إطفاء واجهة الشركة، وهذا يحتاج صلاحية ADB. فالتطبيق يكلّم ADB على الجهاز نفسه (127.0.0.1:5555) بعد موافقة
 *    صاحب الشاشة على نافذة النظام، وينفذ نفس خطوات tools/setup-tv.ps1 مع نفس حمايتها
 *  - أو خدمة الأزرار في النسخة الكاملة: ترد بدال واجهة الشركة (HomeKeyService)
 * الأوامر هنا ثابتة في الكود، ولا يوصلها شي من الصفحة ولا من الشبكة.
 */
object HomeLock {
    val STOCK = listOf("com.google.android.apps.tv.launcherx", "com.google.android.tvlauncher", "com.mitv.tvhome")
    const val SETUP = "com.google.android.tungsten.setupwraith"
    private const val OK_FLAG = "/data/local/tmp/riwaq-ok"

    private fun enabled(ctx: Context, pkg: String) = try {
        ctx.packageManager.getApplicationInfo(pkg, PackageManager.MATCH_DISABLED_COMPONENTS).enabled
    } catch (e: PackageManager.NameNotFoundException) { false }

    /** واجهة الشركة شغالة على الجهاز؟ */
    fun stockOn(ctx: Context) = STOCK.any { enabled(ctx, it) }

    /** رواق هو الواجهة (ما رجّعها المستخدم من صفحة الرجوع) */
    fun riwaqIsHome(ctx: Context) = ctx.packageManager.getComponentEnabledSetting(ComponentName(ctx, "${ctx.packageName}.HomeAlias")) != PackageManager.COMPONENT_ENABLED_STATE_DISABLED

    /** زر البيت يفتح رواق فعلاً: واجهة الشركة مطفية، أو خدمة الأزرار شغالة وترد بدالها */
    fun locked(ctx: Context) = riwaqIsHome(ctx) && (!stockOn(ctx) || (BuildConfig.HAS_KEYS && SetupActivity.a11yOn(ctx)))

    sealed class Outcome {
        object Done : Outcome()
        /** ما فيه ADB على الجهاز: تصحيح الأخطاء مطفي */
        object NoAdb : Outcome()
        /** ما وافق على النافذة، أو ما لحق */
        object NotAllowed : Outcome()
        class Failed(val why: String) : Outcome()
    }

    /** يقفل زر البيت. يشتغل في خيط ثاني، وينتظر موافقة صاحب الشاشة على النافذة */
    fun lock(ctx: Context): Outcome {
        val pkg = ctx.packageName
        val alias = "$pkg/.HomeAlias"
        return try {
            SelfAdb(ctx).use { adb ->
                val installed = adb.shell("pm list packages").lines().map { it.removePrefix("package:").trim() }
                val targets = STOCK.filter { it in installed }
                val backAll = (targets + SETUP).joinToString("; ") { "pm enable --user 0 $it" }
                // مفتاح أمان: لو انقطع شي في النص، بعد ٣ دقايق واجهة الشركة ترجع لحالها
                adb.shell("rm -f $OK_FLAG; nohup sh -c 'sleep 180; [ -f $OK_FLAG ] || { $backAll; }' >/dev/null 2>&1 &")
                val back = { targets.forEach { adb.shell("pm enable --user 0 $it") }; adb.shell("touch $OK_FLAG") }
                adb.shell("pm enable $alias")
                targets.forEach { adb.shell("pm disable-user --user 0 $it") }
                if (Build.VERSION.SDK_INT >= 29) adb.shell("cmd package set-home-activity --user 0 $alias")
                var home = homeResolves(adb)
                // معالج إعداد Google TV يرد لو انطفت الواجهة. نطفيه بس لو مو هو اللي حفظ شبكة الواي فاي (إطفاءه يمسحها)
                if (!home.contains(pkg) && home.contains(SETUP)) {
                    if (Regex("(creatorName|lastUpdateName)=${Regex.escape(SETUP)}").containsMatchIn(adb.shell("dumpsys wifi"))) {
                        back()
                        return Outcome.Failed("معالج الإعداد هو اللي حفظ شبكة الواي فاي في هذا الجهاز، وإطفاءه ممكن يمسحها. رجّعنا كل شي زي ما كان.")
                    }
                    adb.shell("pm disable-user --user 0 $SETUP")
                    if (Build.VERSION.SDK_INT >= 29) adb.shell("cmd package set-home-activity --user 0 $alias")
                    home = homeResolves(adb)
                }
                if (!home.contains(pkg)) {
                    back()
                    return Outcome.Failed("زر البيت ما فتح رواق بعد الإعداد، فرجّعنا كل شي زي ما كان.")
                }
                // شاشة الانتظار، وصلاحية الأذان، وخدمة الأزرار في النسخة الكاملة: نفس سكربت التركيب
                adb.shell("settings put secure screensaver_components $pkg/.RiwaqDream; settings put secure screensaver_enabled 1")
                // بعدها رواق يرجّع نفسه كشاشة توقف لو النظام غيّرها (DreamGuard)، بدون ما نحتاج تصحيح الأخطاء
                adb.shell("pm grant $pkg android.permission.WRITE_SECURE_SETTINGS")
                if (Build.VERSION.SDK_INT >= 31) adb.shell("appops set $pkg SCHEDULE_EXACT_ALARM allow")
                if (BuildConfig.HAS_KEYS && !SetupActivity.a11yOn(ctx)) {
                    val mine = "$pkg/$pkg.HomeKeyService"
                    val now = adb.shell("settings get secure enabled_accessibility_services").trim()
                    val all = if (now.isEmpty() || now == "null") mine else "$now:$mine"
                    adb.shell("settings put secure enabled_accessibility_services $all; settings put secure accessibility_enabled 1")
                }
                adb.shell("touch $OK_FLAG")
                Outcome.Done
            }
        } catch (e: SelfAdb.NoServer) {
            Outcome.NoAdb
        } catch (e: SelfAdb.NotAuthorized) {
            Outcome.NotAllowed
        } catch (e: Exception) {
            Outcome.Failed(e.message ?: "انقطع الاتصال. واجهة الشركة ترجع لحالها خلال ٣ دقايق لو ما خلصت الخطوات.")
        }
    }

    private fun homeResolves(adb: SelfAdb) = adb.shell("cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME")

    /** صفحة الرجوع: يشغّل واجهة الشركة بدون ما يدور المستخدم في الإعدادات (لو تصحيح الأخطاء للحين شغال) */
    fun restoreStock(ctx: Context): Outcome = try {
        SelfAdb(ctx).use { adb -> (STOCK + SETUP).forEach { adb.shell("pm enable --user 0 $it") }; Outcome.Done }
    } catch (e: SelfAdb.NoServer) {
        Outcome.NoAdb
    } catch (e: SelfAdb.NotAuthorized) {
        Outcome.NotAllowed
    } catch (e: Exception) {
        Outcome.Failed(e.message ?: "")
    }

    /** بعد القفل: نطفي تصحيح الأخطاء، عشان ما يبقى باب مفتوح على الشبكة */
    fun closeAdb(ctx: Context): Outcome = try {
        SelfAdb(ctx).use { adb -> adb.shell("settings put global adb_enabled 0"); Outcome.Done }
    } catch (e: SelfAdb.NoServer) {
        Outcome.Done // انطفى خلاص
    } catch (e: SelfAdb.NotAuthorized) {
        Outcome.NotAllowed
    } catch (e: Exception) {
        Outcome.Done // الأمر نفسه يقطع الاتصال
    }
}

/**
 * عميل ADB صغير يكلّم الجهاز نفسه. البروتوكول: رسائل برأس ٢٤ بايت (CNXN و AUTH و OPEN و WRTE و OKAY و CLSE).
 * المفتاح يتولّد مرة وحدة ويبقى في ملفات التطبيق الخاصة، وأول اتصال يطلّع نافذة النظام "السماح بتصحيح الأخطاء".
 */
class SelfAdb(private val ctx: Context) : AutoCloseable {
    class NoServer : Exception()
    class NotAuthorized : Exception()

    private val socket = Socket()
    private lateinit var input: DataInputStream
    private lateinit var output: OutputStream
    private var nextId = 1

    private class Msg(val cmd: Int, val a0: Int, val a1: Int, val data: ByteArray)

    init {
        try {
            socket.connect(InetSocketAddress("127.0.0.1", PORT), 2000)
        } catch (e: Exception) {
            throw NoServer()
        }
        input = DataInputStream(socket.getInputStream())
        output = socket.getOutputStream()
        connect()
    }

    private fun connect() {
        socket.soTimeout = 5000
        send(CNXN, VERSION, MAX_DATA, "host::\u0000".toByteArray())
        val keys = keyPair()
        var sentKey = false
        var signed = false
        while (true) {
            val m = try { read() } catch (e: java.io.IOException) { if (sentKey) throw NotAuthorized() else throw NoServer() }
            when (m.cmd) {
                CNXN -> { socket.soTimeout = 20000; return }
                AUTH -> {
                    if (!signed) {
                        signed = true
                        send(AUTH, AUTH_SIGNATURE, 0, sign(keys, m.data))
                    } else if (!sentKey) {
                        sentKey = true
                        // النافذة تطلع الحين: ننتظر صاحب الشاشة
                        socket.soTimeout = 90000
                        send(AUTH, AUTH_RSAPUBLICKEY, 0, publicKey(keys.public as RSAPublicKey))
                    } else throw NotAuthorized()
                }
                else -> throw NoServer()
            }
        }
    }

    /** ينفذ أمر ويرجّع مخرجاته */
    fun shell(cmd: String): String {
        val local = nextId++
        send(OPEN, local, 0, "shell:$cmd\u0000".toByteArray())
        val out = StringBuilder()
        while (true) {
            val m = read()
            if (m.a1 != local && m.cmd != CLSE) continue
            when (m.cmd) {
                WRTE -> { out.append(String(m.data)); send(OKAY, local, m.a0, ByteArray(0)) }
                CLSE -> { send(CLSE, local, m.a0, ByteArray(0)); return out.toString() }
            }
        }
    }

    private fun send(cmd: Int, a0: Int, a1: Int, data: ByteArray) {
        val h = ByteBuffer.allocate(24 + data.size).order(ByteOrder.LITTLE_ENDIAN)
        h.putInt(cmd).putInt(a0).putInt(a1).putInt(data.size).putInt(data.sumOf { it.toInt() and 0xff }).putInt(cmd xor -1).put(data)
        output.write(h.array())
        output.flush()
    }

    private fun read(): Msg {
        val head = ByteArray(24)
        input.readFully(head)
        val h = ByteBuffer.wrap(head).order(ByteOrder.LITTLE_ENDIAN)
        val cmd = h.int; val a0 = h.int; val a1 = h.int; val len = h.int
        if (len < 0 || len > 1 shl 20) throw java.io.IOException("bad length")
        val data = ByteArray(len)
        input.readFully(data)
        return Msg(cmd, a0, a1, data)
    }

    private fun keyPair(): KeyPair {
        val priv = File(ctx.filesDir, "adb.key")
        val pub = File(ctx.filesDir, "adb.pub")
        val kf = KeyFactory.getInstance("RSA")
        if (priv.exists() && pub.exists()) {
            return KeyPair(kf.generatePublic(X509EncodedKeySpec(pub.readBytes())), kf.generatePrivate(PKCS8EncodedKeySpec(priv.readBytes())))
        }
        val kp = KeyPairGenerator.getInstance("RSA").apply { initialize(2048) }.generateKeyPair()
        priv.writeBytes(kp.private.encoded)
        pub.writeBytes(kp.public.encoded)
        return kp
    }

    // توقيع RSA لرمز ADB: PKCS#1 v1.5 والرمز نفسه يعتبر ناتج SHA1
    private fun sign(kp: KeyPair, token: ByteArray): ByteArray {
        val block = ByteArray(256)
        val tail = SHA1_PREFIX + token
        block[0] = 0; block[1] = 1
        for (i in 2 until 256 - tail.size - 1) block[i] = 0xff.toByte()
        block[256 - tail.size - 1] = 0
        System.arraycopy(tail, 0, block, 256 - tail.size, tail.size)
        return Cipher.getInstance("RSA/ECB/NoPadding").apply { init(Cipher.ENCRYPT_MODE, kp.private) }.doFinal(block)
    }

    // صيغة مفتاح ADB: الطول، و n0inv، و n و R² بالكلمات من الأصغر، والأس
    private fun publicKey(k: RSAPublicKey): ByteArray {
        val words = 64
        val r32 = BigInteger.ONE.shiftLeft(32)
        val n = k.modulus
        val n0inv = n.mod(r32).modInverse(r32).negate().mod(r32).toInt()
        val rr = BigInteger.ONE.shiftLeft(4096).mod(n)
        val b = ByteBuffer.allocate(4 + 4 + 256 + 256 + 4).order(ByteOrder.LITTLE_ENDIAN)
        b.putInt(words).putInt(n0inv)
        fun big(v: BigInteger) { var x = v; repeat(words) { b.putInt(x.mod(r32).toInt()); x = x.shiftRight(32) } }
        big(n); big(rr)
        b.putInt(k.publicExponent.toInt())
        return (Base64.encodeToString(b.array(), Base64.NO_WRAP) + " riwaq@tv\u0000").toByteArray()
    }

    override fun close() { try { socket.close() } catch (e: Exception) { } }

    private companion object {
        const val PORT = 5555
        const val CNXN = 0x4e584e43; const val AUTH = 0x48545541; const val OPEN = 0x4e45504f
        const val OKAY = 0x59414b4f; const val CLSE = 0x45534c43; const val WRTE = 0x45545257
        const val VERSION = 0x01000000; const val MAX_DATA = 4096
        const val AUTH_SIGNATURE = 2; const val AUTH_RSAPUBLICKEY = 3
        val SHA1_PREFIX = byteArrayOf(0x30, 0x21, 0x30, 0x09, 0x06, 0x05, 0x2b, 0x0e, 0x03, 0x02, 0x1a, 0x05, 0x00, 0x04, 0x14)
    }
}
