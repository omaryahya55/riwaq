package app.riwaq.tv

/**
 * النسخة الخفيفة (lite): بدون خدمة إمكانية الوصول، فتتركّب من Downloader بدون ما تحظرها Play Protect.
 * هذا مكان فاضي عشان باقي الكود (صفحة الرجوع) يشتغل في النسختين بنفس الشكل.
 * ما فيها: ضغطة البيت المطوّلة، وأزرار التطبيقات في الريموت، وإيقاف الأذان بزر الرجوع من تطبيق ثاني.
 */
class HomeKeyService {
    fun disableSelf() {}
    fun setFilter(on: Boolean) {}

    companion object {
        @Volatile var instance: HomeKeyService? = null
    }
}
