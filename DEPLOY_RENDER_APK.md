# نشر المشروع على Render + توليد APK عبر AppCreator24

## 1) رفع المشروع إلى Render

### الخطوات
1. **انشر الكود على GitHub**: من Lovable اضغط `GitHub → Connect to GitHub` وأنشئ ريبو.
2. اذهب إلى [https://dashboard.render.com](https://dashboard.render.com) وسجّل الدخول.
3. اضغط **New +** → **Blueprint** → اختر الريبو (سيلتقط `render.yaml` تلقائيًا).
4. أو يدويًا: **New +** → **Web Service** → اختر الريبو، ثم:
   - **Runtime**: `Node`
   - **Build Command**: `bun install --frozen-lockfile && DEPLOY_TARGET=node bun run build`
   - **Start Command**: `node .output/server/index.mjs`
   - **Plan**: Free
5. في تبويب **Environment** أضف:
   ```
   DEPLOY_TARGET = node
   NODE_VERSION = 20
   VITE_SUPABASE_URL = https://<PROJECT_REF>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY = <ANON_KEY>
   VITE_SUPABASE_PROJECT_ID = <PROJECT_REF>
   ```
   (خذها من إعدادات Lovable Cloud → Advanced → Env)
6. اضغط **Create Web Service** — سيبني وينشر خلال 3-5 دقائق.
7. ستحصل على رابط مثل: `https://internet-cards.onrender.com`

> ⚠️ خطة Free تنام بعد 15 دقيقة خمول (أول طلب يستغرق ~30 ثانية).

---

## 2) توليد APK عبر AppCreator24

1. حمّل تطبيق **AppCreator24** من Google Play.
2. افتحه → **New App** → اختر نوع **Web App / WebView**.
3. **App Name**: مثلاً "شبكات الإنترنت"
4. **Website URL**: الصق رابط Render (`https://internet-cards.onrender.com`)
5. **الإعدادات المهمة:**
   - ✅ Full Screen: مفعّل
   - ✅ Zoom Controls: معطّل
   - ✅ Allow Camera / Storage / Location: حسب الحاجة
   - ✅ JavaScript: مفعّل
   - ✅ DOM Storage: مفعّل (ضروري لـ Supabase Auth)
   - ✅ Cache: مفعّل
   - ✅ Orientation: Portrait
   - ✅ Splash Screen: أضف صورة الشعار
   - ✅ App Icon: أضف أيقونة 512×512
6. **Ads**: عطّلها إن لم تحتجها.
7. اضغط **Create App** → انتظر البناء → حمّل ملف APK.

---

## 3) ما تم ضبطه في المشروع

- **`render.yaml`**: إعداد نشر جاهز.
- **`vite.config.ts`**: يستخدم `DEPLOY_TARGET=node` لبناء Node server (Nitro `node-server`).
- **viewport meta**: مضبوط لجميع الهواتف مع `viewport-fit=cover` لدعم Notch.
- كل الصفحات responsive (Grid يتكيّف: عمود واحد على الموبايل، عمودان/ثلاثة على التابلت/الديسكتوب).
- خط Cairo واتجاه RTL كامل.

---

## 4) نصائح لتجربة أفضل داخل WebView

- **تجنّب نوم Render**: استخدم [UptimeRobot](https://uptimerobot.com) لعمل ping كل 10 دقائق للرابط.
- **HTTPS إجباري**: Render يوفّره افتراضيًا — لا تستخدم HTTP.
- **إذن الإشعارات**: WebView لا يدعم Web Push بشكل أصلي — للإشعارات استخدم Firebase Cloud Messaging مع إعداد إضافي.
- إذا احتجت **تطبيق أندرويد أصلي حقيقي** بدلاً من WebView، استخدم البرومنت في `flutter_android_prompt.md` لبناء تطبيق Flutter.
