# نشر التطبيق على Render

## الخطوات

1. ارفع المشروع إلى GitHub (من زر GitHub في Lovable).
2. في [Render Dashboard](https://dashboard.render.com) → **New +** → **Web Service** واختر المستودع.
3. Render سيقرأ ملف `render.yaml` تلقائيًا (خطة `standard` مدفوعة). أو أدخل الإعدادات يدويًا:
   - **Runtime**: Node
   - **Build Command**: `bun install --frozen-lockfile && bun run build`
   - **Start Command**: `node scripts/render-start.mjs`
   - **Node Version**: 20

## متغيرات البيئة (Environment Variables)

أضفها في Render → Settings → Environment:

| Key | القيمة |
|-----|--------|
| `DEPLOY_TARGET` | `node` (مهم — يُبني نيترو بمُخرج Node بدل Cloudflare) |
| `NODE_ENV` | `production` |
| `VITE_SUPABASE_URL` | من ملف `.env` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | من ملف `.env` |
| `VITE_SUPABASE_PROJECT_ID` | من ملف `.env` |
| `SUPABASE_URL` | نفس قيمة `VITE_SUPABASE_URL` |
| `SUPABASE_PUBLISHABLE_KEY` | نفس قيمة `VITE_SUPABASE_PUBLISHABLE_KEY` |
| `SUPABASE_SERVICE_ROLE_KEY` | من لوحة Lovable Cloud (إن لزم) |

## ملاحظات مهمة للاستضافة المدفوعة

- الخطة في `render.yaml` محددة بـ `standard` (مدفوعة)، لذا لا تنام الخدمة.
- إذا توقف الموقع بعد دقيقة، السبب الأرجح أن عملية الخادم تنهار (crash). تم إضافة:
  - **Health check path**: `/api/public/health` خفيف ولا يحمّل واجهة التطبيق.
  - **Wrapper script**: `scripts/render-start.mjs` يعيد تشغيل الخادم تلقائيًا عند الانتهار ويسجّل السبب في سجلات Render.
- الـ`PORT` يوفّره Render تلقائيًا؛ Node server يقرأه من `process.env.PORT`.
- لا تستخدم `npm install` في Render؛ استخدم Bun فقط مع `--frozen-lockfile` حتى لا يتم جلب إصدارات أحدث تكسر البناء.
- GitHub Actions `Monitor Render service` تعمل كل 15 دقيقة لتسجيل الحالة؛ على الخطة المدفوعة لا حاجة لتشغيلها للإبقاء على الخدمة مستيقظة، لكنها مفيدة لتشخيص الأعطال من سجلات GitHub.

## تشخيص التوقف

1. افتح Render Dashboard → Logs → اختر الخدمة.
2. ابحث عن رسائل تبدأ بـ `[render-start:warn]` أو `[render-start:error]` — تُبيّن سبب انتهار الخادم.
3. افحص `/api/public/health` يدويًا: يُرجع `uptime` و`memory` لمعرفة إن كان الخادم يُعاد تشغيله باستمرار.
