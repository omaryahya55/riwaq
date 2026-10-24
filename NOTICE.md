# الأطراف الثالثة / Third-party notices

## مكتبات وخطوط داخل التطبيق

| الاسم | الرخصة | المكان |
|---|---|---|
| [adhan-js](https://github.com/batoulapps/adhan-js) 4.4.6 | MIT | `web/vendor/adhan/` (ملف الرخصة معه) |
| [Amiri](https://github.com/aliftype/amiri) | SIL OFL 1.1 | `web/fonts/amiri/` (OFL.txt معه) |
| [IBM Plex Sans Arabic](https://github.com/IBM/plex) | SIL OFL 1.1 (اسم محجوز: Plex) | `web/fonts/plex/` (OFL.txt معه) |
| [Reem Kufi](https://github.com/aliftype/reem-kufi) (اسم المشروع فوق الشريط) | SIL OFL 1.1 | `web/fonts/reemkufi/` (OFL.txt معه) |
| [Amiri Quran](https://github.com/aliftype/amiri) (الآيات) | SIL OFL 1.1 | `web/fonts/amiriquran/` (OFL.txt معه) |
| [Noto Naskh Arabic](https://github.com/notofonts/arabic) (الأحاديث والأذكار) | SIL OFL 1.1 | `web/fonts/notonaskh/` (OFL.txt معه) |
| [ZXing core](https://github.com/zxing/zxing) 3.5.3 | Apache-2.0 | مكتبة أندرويد (رسم الباركود) |
| [AndroidX WebKit](https://developer.android.com/jetpack/androidx/releases/webkit) 1.12.1 | Apache-2.0 | مكتبة أندرويد |

الخطوط ما تعدّلت، وأسماؤها الأصلية باقية.

## مصادر البيانات (تنطلب وقت التشغيل، وتنذكر على الشاشة)

| المصدر | وش ناخذ | الشروط (قرأناها 2026-10-23) |
|---|---|---|
| [Open-Meteo](https://open-meteo.com/en/terms) | الطقس والغبار، وبحث المدن (GeoNames) | مجاني لغير التجاري، و CC BY 4.0 مع رابط "Weather data by Open-Meteo.com" |
| [gold-api.com](https://gold-api.com/terms) | الذهب والفضة وبيتكوين وإيثريوم | الاستخدام التجاري مسموح |
| [Frankfurter](https://frankfurter.dev/) | أسعار العملات (البنوك المركزية) | مجاني للتجاري |
| [TheSportsDB](https://www.thesportsdb.com/docs_terms_of_use.php) | ترتيب الدوريات والمباريات | المفتاح المجاني للتطوير، والنشر في المتجر يحتاج اشتراك. لازم نذكر المصدر. **بدون شعارات الأندية** |

## المحتوى الديني

نص القرآن (إذا انضاف) من [Tanzil](https://tanzil.net) حرفياً مع إشعار الحقوق (CC BY 3.0، ممنوع التعديل).
الأحاديث والأذكار وفضائل الصحابة تنقل حرفياً من مصادر معتمدة مع المرجع ورابط التحقق: [sunnah.com](https://sunnah.com) (بعد الإذن) أو [موسوعة الأحاديث النبوية HadeethEnc.com](https://hadeethenc.com) حسب [سياسة استخدامها](https://github.com/IslamHouse-API/multilingual-quran-hadith-islamic-content-database-api-hub) (بدون تعديل، مع ذكر المصدر). شوف [docs/CONTENT.md](docs/CONTENT.md).

### حصن المسلم
الأذكار والأدعية كلها (٢٦٧ ذكر بترقيم الكتاب، مع عنوان كل باب وحاشية التخريج) من كتاب **حصن المسلم من أذكار الكتاب والسنة** لسعيد بن علي بن وهف القحطاني رحمه الله، منقولة حرفياً بسكربت (النص: hisnmuslim.com، والتخريج من حواشي نسخة IslamHouse.com). أي ذكر نصه فيه رموز خطوط مكسورة في المصدرين ما ينعرض بدل ما نصلحه باليد. إذن المؤلف في الكتاب (الطبعة ٣٤، رجب ١٤٢٧هـ): "حقوق الطبع محفوظة إلا لمن أراد طبعه وتوزيعه مجاناً، بدون حذف أو إضافة أو تغيير، فله ذلك وجزاه الله خيراً.. بشرط أن يكتب على الغلاف الخارجي (وقف لله تعالى)". رواق مجاني، والنصوص بدون تغيير، و"وقف لله تعالى" مكتوبة في صفحة المشروع وصفحة الإعدادات.

### القرآن الكريم
نص المصحف من **مشروع Tanzil** (https://tanzil.net)، النسخة البسيطة، منقول حرفياً بسكربت (`tools/import-quran.py`). شروطهم: النسخ والتوزيع حرفياً مسموح والتغيير ممنوع، مع ذكر المصدر ورابط tanzil.net (رخصة CC BY 3.0). إشعار الحقوق الكامل محفوظ مع النص في `web/content/approved.json` (`_quranNotice`).

### حكاية مكان
تعريف كل مكان: أول جملة من مقالته في [ويكيبيديا العربية](https://ar.wikipedia.org) حرفياً، برخصة [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) (النص المنقول يبقى بنفس الرخصة). الصور من [ويكيميديا كومنز](https://commons.wikimedia.org) بس اللي رخصتها حرة (CC BY أو CC BY-SA أو CC0 أو ملك عام)، واسم المصوّر والرخصة مكتوبين تحت كل صورة على الشاشة وفي `web/content/approved.json`. السكربت: `tools/import-places.py`.

### Todoist و Telegram
"Todoist" و "Telegram" علامات تجارية لأصحابها. رواق مو تابع لهم ولا مدعوم منهم، ويستخدم واجهاتهم بمفاتيح المستخدم نفسه بس (اختياري).

## الإلهام

الفكرة مستلهمة من مشروع [UrTV](https://github.com/tshi-dev/UrTV). **ما أخذنا منه أي كود أو صورة أو نص**: كل شي هنا مكتوب من الصفر.
