# نشر التطبيق على Render

## الخطوات

1. ارفع المشروع إلى GitHub (من زر GitHub في Lovable).
2. في [Render Dashboard](https://dashboard.render.com) → **New +** → **Web Service** واختر المستودع.
3. Render سيقرأ ملف `render.yaml` تلقائيًا. أو أدخل الإعدادات يدويًا:
   - **Runtime**: Node
   - **Build Command**: `bun install --frozen-lockfile && bun run build`
   - **Start Command**: `node .output/server/index.mjs`
   - **Node Version**: 20

## متغيرات البيئة (Environment Variables)

أضفها في Render → Settings → Environment:

| Key | القيمة |
|-----|--------|
| `DEPLOY_TARGET` | `node` (مهم — يُبني نيترو بمُخرج Node بدل Cloudflare) |
| `VITE_SUPABASE_URL` | من ملف `.env` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | من ملف `.env` |
| `VITE_SUPABASE_PROJECT_ID` | من ملف `.env` |
| `SUPABASE_URL` | نفس قيمة `VITE_SUPABASE_URL` |
| `SUPABASE_PUBLISHABLE_KEY` | نفس قيمة `VITE_SUPABASE_PUBLISHABLE_KEY` |
| `SUPABASE_SERVICE_ROLE_KEY` | من لوحة Lovable Cloud (إن لزم) |

## ملاحظات

- خطة Render المجانية تنام بعد 15 دقيقة خمول (أول طلب بعدها بطيء ~30 ثانية).
- Health check path: `/` (افتراضي).
- الـ`PORT` يوفّره Render تلقائيًا؛ Node server يقرأه من `process.env.PORT`.
- لا تستخدم `npm install` في Render؛ استخدم Bun فقط مع `--frozen-lockfile` حتى لا يتم جلب إصدارات أحدث تكسر البناء.
