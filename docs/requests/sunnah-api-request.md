# طلب مفتاح sunnah.com (مسودة، ما انرسلت)

يرسل على: https://github.com/sunnah-com/api/issues/new (قالب "Request for API access")
⚠️ القالب يطلب إيميل **يظهر للعامة**. يحطه صاحب المشروع (أو إيميل خاص بالمشروع) قبل الإرسال.

---

**Title:** Request for API access: Riwaq (free Arabic Android TV screensaver)

* **Please tell us about yourself (include an email address):**
  Riwaq is a free, open-source (MIT), ad-free Arabic home screen and screensaver for Android TV, made for Muslim families. Maintainer: omaryahya55 on GitHub. Contact: [EMAIL]

* **Your purpose in using this API:**
  To show one hadith per day on the TV screensaver, from Sahih al-Bukhari and Sahih Muslim only, in Arabic. Every hadith is shown verbatim with the collection name and hadith number under it, and the app's settings page links to the matching sunnah.com page so any user can verify it. We would run a one-time import script to build a fixed, curated list that ships inside the app; app users would never call the API directly.

* **API rate limits:**
  * **Maximum requests per second:** 1
  * **Maximum requests per day:** about 500 during the one-time import, then close to zero (occasional refresh)

* **Is your use case better served by having an offline dump of hadith data or programmatic API access?**
  An offline dump of the Arabic text of Sahih al-Bukhari and Sahih Muslim (with your reference numbers) would serve us best. API access works too.

* **What are the languages in which would you like hadith data?**
  Arabic.

* **What programming language will your API client be in?**
  Python (import script). The app itself is JavaScript and Kotlin.

Could you also let us know the attribution and license terms you require for displaying the text in a free, open-source app? We will follow them exactly. Jazakum Allahu khayran.
