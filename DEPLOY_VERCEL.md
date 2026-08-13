# النشر على Vercel

## الإعدادات
- **Framework Preset**: Other (يُقرأ من `vercel.json`)
- **Install Command**: `npm ci`
- **Build Command**: `npm run build`
- **Output**: يتولّاها Nitro تلقائيًا عبر preset `vercel` (المجلد `.vercel/output`)

## متغيرات البيئة المطلوبة (Project → Settings → Environment Variables)
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

انسخ القيم من ملف `.env` في المشروع.

## سبب فشل البناء السابق وحلّه
كانت رسالة الخطأ:

```
[MISSING_EXPORT] "_getRenderedMatches" is not exported by @tanstack/router-core
```

السبب: `@tanstack/react-start` كان بنطاق `^` فقام npm على Vercel بتثبيت
إصدار أحدث لا يتوافق مع `@tanstack/router-core` المثبّت.

الحل المطبّق:
- تثبيت الإصدارات بدقة في `package.json` (`@tanstack/react-start`,
  `@tanstack/react-router`, `@tanstack/router-core`) مع `overrides`.
- تحديث `package-lock.json` واستخدام `npm ci` حتى يُطابق Vercel البيئة المحلية.

> مهم: لا تحذف `package-lock.json`، فهو ما يضمن ثبات الإصدارات على Vercel.
