/*
 * مصادر أخبار جاهزة يختار منها صاحب الشاشة (صفحة الإعدادات). خلاصات RSS عامة تنشرها المواقع نفسها.
 * ما فيه شي مختار افتراضياً (قرار ٩): المستخدم هو اللي يختار، ويقدر يضيف رابط من عنده.
 * جربنا كل رابط 2026-10-24 ورجع أخبار. واس مستبعدة: شروطها تمنع العرض الآلي (البريف قسم ٤).
 * هسبريس انشالت: جابت عناوين ما تناسب شاشة عائلية. وكل العناوين تمر على فلتر كلمات (data.js) قبل ما تطلع.
 */
window.NEWS_SOURCES = [
  { group: "السعودية", items: [
    ["عكاظ", "https://www.okaz.com.sa/rssFeed/0"],
    ["الوطن", "https://www.alwatan.com.sa/rssFeed/1"],
    ["المدينة", "https://www.al-madina.com/rssFeed/1"],
    ["اليوم", "https://www.alyaum.com/rssFeed/0"],
    ["الجزيرة", "https://www.al-jazirah.com/rss/ln.xml"],
    ["Arab News", "https://www.arabnews.com/rss.xml"],
    ["Saudi Gazette", "https://saudigazette.com.sa/rssFeed/74"]
  ] },
  { group: "العربية والعالم", items: [
    ["الجزيرة نت", "https://www.aljazeera.net/aljazeerarss/a7c186be-1baa-4bd4-9d80-a84db769f779/73d0e1b4-532f-45ef-b135-bfdff8b8cab9"],
    ["بي بي سي عربي", "https://feeds.bbci.co.uk/arabic/rss.xml"],
    ["سكاي نيوز عربية", "https://www.skynewsarabia.com/rss"],
    ["الشرق الأوسط", "https://aawsat.com/feed"],
    ["CNN بالعربية", "https://arabic.cnn.com/api/v1/rss/rss.xml"],
    ["فرانس ٢٤", "https://www.france24.com/ar/rss"],
    ["دويتشه فيله", "https://rss.dw.com/xml/rss-ar-all"],
    ["الأناضول", "https://www.aa.com.tr/ar/rss/default?cat=guncel"],
    ["اندبندنت عربية", "https://www.independentarabia.com/rss.xml"],
    ["يورونيوز", "https://arabic.euronews.com/rss"],
    ["روسيا اليوم", "https://rtarabic.com/rss/"],
    ["أخبار قوقل", "https://news.google.com/rss?hl=ar&gl=SA&ceid=SA:ar"]
  ] },
  { group: "الرياضة", items: [
    ["الرياضية", "https://arriyadiyah.com/rss"],
    ["سبورت ٣٦٠", "https://arabic.sport360.com/feed"]
  ] },
  { group: "التقنية", items: [
    ["البوابة العربية للأخبار التقنية", "https://aitnews.com/feed/"],
    ["عالم التقنية", "https://www.tech-wd.com/wd/feed/"]
  ] },
  { group: "بالإنقليزي", items: [
    ["BBC News", "https://feeds.bbci.co.uk/news/world/rss.xml"],
    ["Al Jazeera English", "https://www.aljazeera.com/xml/rss/all.xml"]
  ] }
];
