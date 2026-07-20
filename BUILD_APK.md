# 📱 بناء تطبيق APK لمتجر كروت الواي فاي

هذا الدليل يشرح كيفية تحويل الموقع إلى تطبيق Android حقيقي (`.apk`) باستخدام **Capacitor** و **Android Studio** على جهازك.

---

## ✅ ما تم تجهيزه في المشروع

- `capacitor.config.ts` — إعدادات التطبيق (اسم، هوية، رابط الموقع، ألوان)
- `www/index.html` — صفحة انتقال احتياطية
- `public/app-icon.png` — أيقونة التطبيق (1024×1024)
- الحزم المثبتة: `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/splash-screen`, `@capacitor/status-bar`

---

## 🔧 المتطلبات على جهازك (لمرة واحدة فقط)

1. **Node.js 20+** — https://nodejs.org
2. **JDK 17** — https://adoptium.net
3. **Android Studio** (أحدث إصدار) — https://developer.android.com/studio
   - داخل Android Studio: **SDK Manager** → ثبّت **Android SDK Platform 34** و **Android SDK Build-Tools**
4. **Git** — لتحميل المشروع من Lovable

---

## 🚀 خطوات البناء

### 1) حمّل المشروع إلى جهازك
اذهب في Lovable إلى **GitHub → Connect to GitHub** ثم استنسخ المستودع:
```bash
git clone <رابط-مستودعك>
cd <اسم-المشروع>
```

### 2) ثبّت الحزم
```bash
bun install
# أو: npm install
```

### 3) أضف منصة Android (لمرة واحدة)
```bash
npx cap add android
```
سيتم إنشاء مجلد `android/` يحتوي على مشروع Android Studio كامل.

### 4) زامن الإعدادات
```bash
npx cap sync android
```

### 5) افتح المشروع في Android Studio
```bash
npx cap open android
```
انتظر حتى ينتهي **Gradle Sync** (قد يستغرق أول مرة 5-10 دقائق).

---

## 🎨 استبدال أيقونة التطبيق

1. من قائمة Android Studio: **File → New → Image Asset**
2. **Icon Type**: `Launcher Icons (Adaptive & Legacy)`
3. **Path**: اختر `public/app-icon.png` من مجلد المشروع
4. اضغط **Next → Finish**

### شاشة البداية (Splash)
1. ضع نفس صورة الأيقونة في: `android/app/src/main/res/drawable/splash.png`
2. تم ضبط اللون والأنميشن مسبقاً في `capacitor.config.ts`

---

## 📦 توليد ملف APK

### للاختبار الشخصي (Debug APK)
من قائمة Android Studio:
- **Build → Build Bundle(s)/APK(s) → Build APK(s)**
- انتظر انتهاء البناء، ثم اضغط **locate** لتجد الملف في:
  ```
  android/app/build/outputs/apk/debug/app-debug.apk
  ```
- انقل الملف إلى هاتفك وثبّته (فعّل "مصادر غير معروفة" في الإعدادات).

### للنشر على Google Play (Release AAB موقّع)
1. **Build → Generate Signed Bundle / APK → Android App Bundle**
2. أنشئ **Keystore** جديد:
   - اختر مساراً آمناً (احتفظ به للأبد — تحتاجه لكل تحديث!)
   - أدخل كلمة سر قوية
   - املأ بياناتك (الاسم، الشركة، الدولة)
3. اختر **release** → **V1 + V2 signature**
4. الملف الناتج:
   ```
   android/app/build/outputs/bundle/release/app-release.aab
   ```
5. ارفعه إلى https://play.google.com/console

---

## 🔄 عند تحديث الموقع

الموقع مربوط بـ **Render** مباشرة، لذلك أي تحديث تعمله في Lovable سيظهر تلقائياً داخل التطبيق **بدون إعادة بناء APK** ✨

تحتاج إعادة بناء APK فقط عند:
- تغيير اسم التطبيق أو الأيقونة
- تغيير رابط الاستضافة (عدّل `capacitor.config.ts` ثم `npx cap sync`)
- تغيير رقم الإصدار في `android/app/build.gradle`

---

## ⚠️ ملاحظات مهمة

1. **Render Free Plan** — الموقع ينام بعد 15 دقيقة خمول. أول فتح للتطبيق قد يستغرق 30-40 ثانية. الحل: ترقية إلى Starter ($7/شهر).
2. **الاتصال بالإنترنت مطلوب** — التطبيق يفتح موقعاً بعيداً، لن يعمل بدون إنترنت.
3. **الأذونات** — لا يحتاج التطبيق أي أذونات خاصة (INTERNET فقط، مضاف تلقائياً).
4. **إذا فشل Gradle Sync**: تأكد من JDK 17 (ليس 8 ولا 11):
   ```bash
   java -version
   ```

---

## 📞 مشاكل شائعة

| المشكلة | الحل |
|---|---|
| `SDK location not found` | Android Studio → File → Project Structure → SDK Location |
| `Failed to install the following Android SDK` | افتح SDK Manager وثبّت المطلوب |
| شاشة بيضاء عند فتح التطبيق | تأكد أن رابط Render يعمل في المتصفح |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | احذف التطبيق القديم من الجهاز قبل التثبيت |

---

**تم بحمد الله** 🎉 — لأي مشكلة تواصل: مفيد الزري / 778492884

---

## 🎨 توليد أيقونة التطبيق و Splash بجميع المقاسات تلقائياً

تم تجهيز مصادر التصميم داخل مجلد `resources/`:
- `resources/icon.png` — 1024×1024 (الأيقونة الرئيسية)
- `resources/splash.png` — 1920×1920 (شاشة البداية)

بعد إضافة منصة Android (`npx cap add android`)، شغّل الأمر التالي **مرة واحدة** لتوليد جميع مقاسات الأيقونات و Splash لكل الكثافات (mdpi / hdpi / xhdpi / xxhdpi / xxxhdpi):

```bash
npx @capacitor/assets generate --android
```

سيتم إنشاء الملفات في:
- `android/app/src/main/res/mipmap-*/ic_launcher*.png`
- `android/app/src/main/res/drawable-*/splash.png`

لتغيير التصميم لاحقاً: استبدل `resources/icon.png` أو `resources/splash.png` ثم شغّل الأمر مرة أخرى.

---

## 🚀 شاشة البداية (Splash Screen)

تم تفعيلها في `capacitor.config.ts` مع:
- مدة عرض: 2 ثانية
- لون خلفية: `#009688` (Teal)
- Spinner أبيض في المنتصف
- إخفاء يدوي بعد جاهزية التطبيق (من `src/lib/capacitor-native.ts`)

لا حاجة لأي إعداد إضافي.

---

## 🔗 Deep Links (فتح صفحات محددة من روابط خارجية)

يدعم التطبيق نوعين من الروابط:

### 1) Custom Scheme — `wificards://`
مثال: `wificards://app/cabin` سيفتح صفحة كبينة البيع مباشرة.

### 2) App Links (HTTPS)
مثال: `https://arabic-layout-project.onrender.com/app/cabin`

**خطوة إضافية مطلوبة** — بعد `npx cap add android`، افتح الملف:
`android/app/src/main/AndroidManifest.xml`

وأضف داخل `<activity android:name=".MainActivity" ...>` (بعد `<intent-filter>` الافتراضي):

```xml
<!-- Custom Scheme: wificards://... -->
<intent-filter android:autoVerify="false">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="wificards" />
</intent-filter>

<!-- App Links: https://arabic-layout-project.onrender.com/... -->
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="https"
          android:host="arabic-layout-project.onrender.com" />
</intent-filter>
```

معالجة الرابط تتم تلقائياً في `src/lib/capacitor-native.ts` (المستمع `appUrlOpen`) الذي ينتقل مباشرة إلى المسار داخل التطبيق.

---

## 💾 الكاش وتحسين العمل عند ضعف الإنترنت

### 1) مؤشر عدم الاتصال داخل التطبيق
تم إضافة `OfflineBanner` في `src/components/offline-banner.tsx` يظهر تلقائياً بلون كهرماني عند فقد الاتصال ويختفي عند رجوعه.

### 2) تفعيل كاش WebView (Android)
افتح `android/app/src/main/java/.../MainActivity.java` (أو `.kt`) وأضف داخل `onCreate` بعد `super.onCreate(savedInstanceState);`:

```java
// كاش WebView — يحسّن الأداء عند ضعف/انقطاع الإنترنت
android.webkit.WebSettings settings = this.bridge.getWebView().getSettings();
settings.setCacheMode(android.webkit.WebSettings.LOAD_DEFAULT);
settings.setDomStorageEnabled(true);
settings.setDatabaseEnabled(true);

// عند غياب الإنترنت، حمّل النسخة المخزنة إن وجدت
android.net.ConnectivityManager cm =
    (android.net.ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
android.net.NetworkInfo ni = cm != null ? cm.getActiveNetworkInfo() : null;
if (ni == null || !ni.isConnected()) {
    settings.setCacheMode(android.webkit.WebSettings.LOAD_CACHE_ELSE_NETWORK);
}
```

### 3) زر الرجوع (Back Button)
تم ربطه في `capacitor-native.ts` بحيث يرجع خطوة داخل التطبيق، وعند الوصول للصفحة الأولى يعمل Minimize بدل إغلاق التطبيق.

---

## 📋 ملخص الأوامر السريعة

```bash
# 1) بناء الواجهة
npm run build

# 2) إضافة منصة Android (أول مرة فقط)
npx cap add android

# 3) توليد الأيقونات و Splash بجميع المقاسات
npx @capacitor/assets generate --android

# 4) نسخ الملفات إلى المشروع Android
npx cap sync android

# 5) فتح Android Studio لبناء الـ APK
npx cap open android
```

بعد أي تعديل في `capacitor.config.ts` أو الكود، شغّل:
```bash
npm run build && npx cap sync android
```

---

## 🔁 إعادة المحاولة والطابور الأوفلاين

تم تفعيل تلقائياً في `src/router.tsx` و `src/lib/offline-queue.ts`:

- **Exponential Backoff**: أي طلب فاشل يعاد تلقائياً حتى 3 مرات (1s → 2s → 4s → 8s ... حتى 30s كحد أقصى) — إلا أخطاء 4xx (لا معنى لإعادتها).
- **networkMode: "offlineFirst"**: React Query يعرض البيانات المخزنة أولاً حتى في حال ضعف الاتصال.
- **طابور العمليات**: عند غياب الإنترنت يتم حفظ العمليات في `localStorage` ومزامنتها تلقائياً عند عودة الاتصال (event `online`) أو عند فتح التطبيق.

استخدام الطابور من أي كود جديد:
```ts
import { registerOfflineHandler, enqueueOrRun } from "@/lib/offline-queue";

// عند بدء التطبيق (مرة واحدة) — سجّل كيف تنفذ العملية عند المزامنة
registerOfflineHandler("sale.create", async (payload) => {
  await supabase.from("sales").insert(payload as any);
});

// عند تنفيذ العملية من المستخدم
await enqueueOrRun("sale.create", payload, async () => {
  await supabase.from("sales").insert(payload as any);
});
```

## 💾 التخزين المحلي (Cache)

React Query Persist يحفظ نتائج queries أساسية (`packages`, `cards-available`, `networks`) في `localStorage` لمدة 24 ساعة → يفتح التطبيق مباشرة ويعرض البيانات القديمة حتى أثناء عدم الاتصال.

## 🐛 تتبع الأخطاء (Sentry)

- الملف: `src/lib/sentry.ts`
- التفعيل: عيّن المتغير في **Render** (وأيضاً في `.env.local` للتطوير):
  ```
  VITE_SENTRY_DSN=https://xxxx@oXXXX.ingest.sentry.io/YYY
  ```
- بدون DSN التطبيق يعمل عادي بدون أي أثر.
- عند التفعيل: كل أخطاء React + خطاء طلبات Supabase + أحداث Deep Links (breadcrumbs) تُرسل تلقائياً إلى Sentry مع tag يوضّح إذا كان التشغيل من WebView Android أو من المتصفح.

### كيفية إنشاء DSN مجاني:
1. سجّل حساب على [sentry.io](https://sentry.io) (Free tier: 5k events/month).
2. أنشئ مشروع من نوع **React**.
3. انسخ الـ DSN وضعه في متغيرات Render.
4. أعد نشر الموقع → أي خطأ سيظهر في Sentry Dashboard مع stack trace كامل.

