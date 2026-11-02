/*
 * شرط عرض الحديث (قرار صاحب المشروع 2026-11-02): ما يطلع حديث إلا براويه ومن رواه وصحته.
 * كل هذي القيم من البيانات نفسها، ما نكتب منها شي من عندنا:
 *  - الراوي: حقل narrator من الشاملة، أو أول اسم بعد «عن» في نص الحديث
 *  - من رواه: الكتاب ورقم الحديث من التخريج، أو عزو المصدر («رواه مسلم»)
 *  - الصحة: الدرجة ومن حكم بها. في الصحيحين أو من الموسوعة الحديثية ما تحتاج قائل ثاني، وغيرها لازم قائلها
 * اللي ما يكمل الشرط، أو عبارة درجته ما تنفهم للمشاهد، ما ينعرض لين يراجعه مختص (يبقى في الملف).
 * الملف مشترك بين الشاشة وصفحة الإعدادات والاختبارات.
 */
(function () {
  const bare = (s) => String(s || "").replace(/[ً-ٰـ​-‏]/g, "");
  function narrator(x) {
    if (x.narrator) return x.narrator;
    if (x.type !== "hadith" && x.type !== "sahabi") return "";
    const m = bare(x.text).trim().match(/^و?عن\s+(.+?)(?:\s+(?:رضي|رحمه|قال|قالت|أن|أنه|أنها|أنهما|عن|سمع|سمعت|يقول)(?=[\s،,:؛]|$)|\s*[،,:؛«"(\-])/);
    if (!m) return "";
    const words = m[1].trim().split(/\s+/);
    if (words.length > 8) return "";
    // «عن أبي هريرة» ← الراوي: أبو هريرة (أول الاسم بس، مو «سعد بن أبي وقاص»)
    return words.map((w, i) => (i === 0 && w === "أبي" ? "أبو" : w === "وأبي" ? "وأبو" : w)).join(" ");
  }
  const BOOKS = ["صحيح البخاري", "صحيح مسلم", "سنن أبي داود", "سنن الترمذي", "سنن النسائي", "سنن ابن ماجه", "مسند أحمد", "موطأ مالك", "سنن الدارمي"];
  const arNum = (s) => String(s).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]);
  function books(x) {
    const out = [];
    for (const line of String(x.reference || "").split("\n")) {
      const l = line.replace(/^[\s\d\-–.]+/, "").trim();
      const name = BOOKS.find((b) => l.startsWith(b));
      const num = name && l.slice(name.length).match(/^\s*(?:\(\s*\d+\s*\/\s*\d+\s*\)\s*)?\(\s*(\d+)\s*\)/);
      if (num && !out.some((o) => o.startsWith(name))) out.push(name + " (" + arNum(num[1]) + ")");
    }
    return out.slice(0, 3);
  }
  // عبارات الدرجة اللي تنفهم للمشاهد. غيرها (مثل «صحيح م دون الاتخاذ») تنتظر مختص
  const CLEAR_GRADES = ["صحيح", "حسن", "حسن صحيح", "صحيح الإسناد", "إسناده صحيح على شرط مسلم", "صحيح على شرط مسلم", "صحيح على شرط البخاري"];
  const inSahihayn = (x) => /البخاري|مسلم|متفق عليه/.test(String(x.attribution || ""));
  function why(x) {
    if (x.type !== "hadith" && x.type !== "sahabi") return "";
    if (!narrator(x)) return "بلا راوي";
    // من رواه: التخريج بالكتاب والرقم، أو عزو المصدر نفسه («رواه مسلم»، «متفق عليه»)
    const hasBook = Array.isArray(x.takhrij) ? x.takhrij.length > 0 : books(x).length > 0 || !!String(x.attribution || "").trim();
    if (!hasBook) return "بلا مصدر";
    if (!x.grade) return "بلا درجة";
    if (!CLEAR_GRADES.includes(String(x.grade).trim())) return "عبارة الدرجة تحتاج مختص";
    if (!x.gradeBy && !inSahihayn(x) && x.edition !== "HadeethEnc.com") return "الدرجة بلا قائل";
    return "";
  }
  window.Rules = { narrator, books, displayable: (x) => !why(x), why };
})();
