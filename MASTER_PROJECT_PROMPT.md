# MASTER_PROJECT_PROMPT — مواصفات كاملة لمشروع «كرتي» (إدارة وبيع كروت الإنترنت)

> وثيقة مواصفات تقنية شاملة (Master Prompt + Technical Specification).
> الغرض: إعطاء هذه الوثيقة لأي نموذج ذكاء اصطناعي لإعادة بناء المشروع بنسبة 100%.
> كل ما هو مذكور هنا مستخرج من الكود الفعلي وقاعدة البيانات الفعلية للمشروع.

---

## 1. وصف المشروع بالكامل

**الاسم:** كرتي (Karti) — تطبيق ويب + أندرويد لإدارة وبيع كروت الإنترنت اللاسلكي (WiFi Vouchers).

**الفكرة:** منصة متعددة الشبكات (Multi-tenant). كل «شبكة إنترنت» (Network) كيان مستقل تماماً له:
مدير (Admin/Owner) واحد، مناديب بيع (Agents)، باقات (Packages)، كروت (Cards)، مبيعات (Sales)، زبائن (Customers)،
طلبات كروت (Card Requests)، طلبات انضمام (Join Requests)، ديون وسداد (Debts/Payments)، أجهزة MikroTik، وسجلات (Logs).
لا يمكن لأي شبكة رؤية بيانات شبكة أخرى إطلاقاً (عزل صارم عبر RLS و `network_id`).

**فوق الجميع** حساب «مدير التطبيق» (Superadmin) يرى ويدير كل الشبكات والمناديب والباقات والكروت.

**الأدوار (Roles):** `admin` (مدير شبكة) — `agent` (مندوب بيع) — `superadmin` (مدير التطبيق).

**اللغة والاتجاه:** عربي بالكامل، RTL في كل الصفحات والبطاقات والقوائم والجداول، خط Cairo، التواريخ بالعربي (يوم/شهر/سنة)، العملة تُعرض مع الرمز `﷼`.

**التصميم:** Mobile First — بطاقات على الجوال بدل الجداول، جداول قابلة للتمرير أفقياً وعمودياً على الشاشات الأكبر.

**دورة العمل الأساسية:**
1. المدير ينشئ حساباً ويسجّل اسم شبكته → يصبح مالك الشبكة.
2. المندوب يسجّل حساباً ويختار الشبكة → يُنشأ **طلب انضمام** ينتظر موافقة مدير الشبكة.
3. المدير يرفع الكروت (يدوي/TXT/CSV/PDF) على الباقات.
4. المندوب يطلب كروتاً (Card Request) → المدير يوافق فتُسند الكروت للمندوب ويُسجَّل عليه **دين** بقيمة الطلب.
5. المندوب يبيع من **كبينة البيع** → يظهر رقم الكرت **فقط بعد إتمام البيع**.
6. المندوب يربط الزبائن، يرسل الكرت/الفاتورة عبر واتساب، ويتابع أرصدة الزبائن وسدادهم.
7. المدير يسدّد/يستلم الديون من المناديب (صفحة السداد) مع سند PDF وإرسال واتساب.
8. كل شيء يتحدّث فورياً عبر Realtime، ويعمل التطبيق دون إنترنت مع مزامنة لاحقة.

---

## 2. التقنيات المستخدمة

| الطبقة | التقنية |
|---|---|
| الإطار | TanStack Start v1 (React 19 + Vite 8) — توجيه بالملفات |
| التوجيه | @tanstack/react-router 1.170.16 (+ router-plugin) |
| البيانات | @tanstack/react-query 5 + persist-client + sync-storage-persister |
| السيرفر | `createServerFn` من @tanstack/react-start، Nitro preset `node-server` |
| التنسيق | Tailwind CSS v4 (عبر `@tailwindcss/vite`) + `src/styles.css` + tw-animate-css |
| المكوّنات | shadcn/ui كاملة فوق Radix UI + lucide-react + sonner + vaul + cmdk |
| قاعدة البيانات | Supabase (Postgres + Auth + Realtime + RLS) عبر `@supabase/supabase-js` 2.75.0 |
| الجوال | Capacitor 8 (Android) + إضافات: app, splash-screen, status-bar, filesystem, share, browser, app-launcher, file-opener, contacts |
| PDF | pdfmake 0.3 (خط عربي + arabic-persian-reshaper)، html2pdf.js، pdfjs-dist 6 (استخراج نصوص PDF) |
| Excel | write-excel-file |
| الرسوم | recharts |
| النماذج | react-hook-form + @hookform/resolvers + zod |
| المراقبة | @sentry/react + Lovable error reporting |
| الخط | @fontsource/cairo (400/500/600/700/800) |
| الاستضافة | Render (`render.yaml`) + Bun للبناء |

---

## 3. هيكل المشروع

```text
.
├── capacitor.config.ts          # إعداد أندرويد
├── render.yaml                  # نشر Render
├── vite.config.ts               # يستخدم @lovable.dev/vite-tanstack-config + nitro node-server
├── components.json              # إعداد shadcn
├── eslint.config.js .prettierrc bunfig.toml tsconfig.json .node-version
├── build-android.cmd / .ps1     # أتمتة بناء APK
├── scripts/ensure-capacitor-contacts.mjs
├── BUILD_APK.md DEPLOY_RENDER.md DEPLOY_RENDER_APK.md AGENTS.md
├── public/
│   ├── sw.js                    # Service Worker (offline)
│   ├── manifest.webmanifest     # PWA
│   └── favicon.ico
├── supabase/
│   ├── config.toml
│   └── migrations/              # 82 ملف SQL
└── src/
    ├── routes/                  # 23 ملف توجيه
    ├── components/              # 9 مكونات + components/ui (45 مكوّن shadcn)
    ├── hooks/                   # 3 hooks
    ├── lib/                     # 26 ملف (منطق، PDF، واتساب، offline، صيغ...)
    ├── integrations/supabase/   # client, client.server, auth-middleware, auth-attacher, types
    ├── routeTree.gen.ts (مولَّد) router.tsx start.ts server.ts styles.css
```

---

## 4. قاعدة البيانات كاملة

### الأنواع (Enums)
```sql
create type app_role    as enum ('admin','moderator'-غير مستخدم-,'agent','superadmin'); -- فعلياً: admin, agent, superadmin
create type card_status as enum ('AVAILABLE','ASSIGNED','SOLD');
```

### 4.1 الجداول (14 جدول في schema `public`)

**networks** — الشبكات
`id uuid pk`, `name text not null`, `description text`, `currency text not null`, `primary_color text not null`,
`secondary_color text not null`, `logo_url`, `cover_url`, `is_active bool not null`, `created_by uuid → auth.users`,
`owner_id uuid → auth.users`, `created_at`, `updated_at`.
فهرس فريد `lower(name)`، فهرس على `owner_id`.

**profiles** — ملفات المستخدمين
`id uuid pk → auth.users`, `username text not null unique` (مشتق من رقم الهاتف), `full_name`, `phone`,
`is_active bool not null`, `network_id uuid → networks`, `created_at`, `updated_at`. فهرس على `network_id`.

**user_roles** — الأدوار (منفصلة عن profiles لمنع تصعيد الصلاحيات)
`id`, `user_id → auth.users`, `role app_role`, `created_at`.

**packages** — الباقات
`id`, `network_id → networks`, `name`, `price numeric`, `data_size`, `speed`, `validity`, `allowed_time`,
`description`, `color`, `icon`, `sort_order int`, `is_active bool`, `created_at`, `updated_at`.

**cards** — الكروت
`id`, `package_id → packages`, `network_id → networks`, `username text not null`, `password text`,
`status card_status`, `assigned_to uuid → auth.users`, `assigned_at`, `sold_to uuid → auth.users`, `sold_at`, `created_at`.
فريد `(package_id, username)`؛ فهارس `(package_id,status)`, `(assigned_to,package_id) where status='ASSIGNED'`, `(sold_to)`.

**card_requests** — طلبات الكروت من المناديب
`id`, `agent_id`, `agent_username`, `package_id`, `network_id`, `package_name`, `network_name`,
`quantity int`, `approved_quantity int`, `status text` (PENDING/APPROVED/REJECTED), `notes`, `reject_reason`,
`decided_by`, `decided_at`, `payment_method text`, `unit_price numeric`, `total_value numeric`, `paid_amount numeric`,
`created_at`, `updated_at`. فهارس `(agent_id, created_at desc)`, `(status, created_at desc)`.

**request_payments** — دفعات المندوب على طلب
`id`, `request_id → card_requests`, `amount numeric`, `note`, `recorded_by`, `recorded_by_username`, `created_at`.

**join_requests** — طلبات انضمام المناديب للشبكة
`id`, `network_id`, `agent_id`, `agent_username`, `agent_full_name`, `agent_phone`, `status`,
`reject_reason`, `requested_at`, `decided_at`, `decided_by`. فهارس `(agent_id)`, `(network_id,status)`.

**sales** — المبيعات
`id`, `transaction_no text`, `card_id → cards`, `package_id`, `network_id`, `agent_id`, `customer_id → customers`,
`price numeric`, `package_name`, `network_name`, `agent_username`, `buyer_name`, `card_number`,
`is_external bool` (بيع خارجي بدون كرت من النظام), `sold_at`. فهارس `(agent_id)`, `(customer_id)`, `(sold_at desc)`, `(package_id)`.

**customers** — الزبائن (تابعون للمندوب)
`id`, `agent_id`, `network_id`, `name`, `whatsapp`, `created_at`, `updated_at`. فهرس `(agent_id)`.

**customer_payments** — سداد الزبائن
`id`, `customer_id → customers`, `agent_id`, `network_id`, `amount numeric`, `note`, `created_at`.

**mikrotiks** — أجهزة الميكروتيك
`id`, `network_id`, `name`, `host`, `username`, `password`, `port int`, `use_https bool`, `notes`, `created_by`, timestamps.

**password_reset_requests** — طلبات استعادة كلمة السر
`id`, `phone`, `note`, `status`, `resolved_by`, `resolved_at`, `created_at`.

**logs** — سجل العمليات
`id`, `user_id`, `actor_username`, `action`, `entity`, `entity_id`, `metadata jsonb`, `created_at`. فهرس `(created_at desc)`.

### 4.2 قواعد المخطط الإلزامية
- كل `CREATE TABLE` في `public` يتبعه فوراً:
  `GRANT SELECT, INSERT, UPDATE, DELETE ON public.<t> TO authenticated; GRANT ALL ON public.<t> TO service_role;`
  ثم `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` ثم السياسات.
- لا مفاتيح أجنبية على `auth.users` عدا المسموح، الأدوار في جدول منفصل، لا CHECK يعتمد على الوقت (استخدم Triggers).
- trigger `touch_updated_at()` على كل جدول له `updated_at`.

---

## 5. جميع العلاقات بين الجداول

```text
auth.users 1─1 profiles ─* user_roles
networks 1─* profiles (network_id)      networks 1─1 owner (profiles/auth.users)
networks 1─* packages 1─* cards
networks 1─* card_requests 1─* request_payments
networks 1─* join_requests
networks 1─* sales      packages 1─* sales      cards 1─1 sales
profiles(agent) 1─* customers 1─* customer_payments
customers 1─* sales (customer_id)
networks 1─* mikrotiks
profiles 1─* logs
```

---

## 6. جميع سياسات RLS (كما هي في القاعدة)

المحور الأساسي: الدالة `admin_network(auth.uid())` تُعيد `network_id` الخاص بالمدير، و`is_active_user()` تتحقق من تفعيل الحساب.

| الجدول | العملية | السياسة |
|---|---|---|
| card_requests | SELECT | `agent_id = auth.uid() OR network_id = admin_network(auth.uid())` |
| card_requests | INSERT | `agent_id = auth.uid() AND is_active_user(auth.uid())` |
| card_requests | UPDATE/DELETE | `network_id = admin_network(auth.uid())` |
| cards | SELECT | `network_id = admin_network(uid) OR assigned_to = uid OR sold_to = uid` |
| cards | INSERT/UPDATE/DELETE | `network_id = admin_network(uid)` |
| customers | ALL | `agent_id = auth.uid()` |
| customers | SELECT | (إضافية) `network_id = admin_network(uid)` |
| customer_payments | ALL | `agent_id = auth.uid()` ؛ SELECT إضافية للمدير حسب الشبكة |
| join_requests | SELECT | `agent_id = uid OR network_id = admin_network(uid)` — INSERT/DELETE ممنوعة (عبر الدوال فقط) |
| join_requests | UPDATE | `network_id = admin_network(uid)` |
| logs | SELECT | `user_id = uid OR EXISTS(profiles p: p.id = logs.user_id AND p.network_id = admin_network(uid))` |
| logs | DELETE | نفس شرط الشبكة — INSERT/UPDATE ممنوعة |
| mikrotiks | SELECT/INSERT/UPDATE/DELETE | `network_id = admin_network(uid)` |
| networks | SELECT | `owner_id = uid OR id = (select network_id from profiles where id = uid)` |
| networks | UPDATE/DELETE | `owner_id = uid` — INSERT ممنوع (عبر `create_my_network`) |
| packages | SELECT | `network_id = admin_network(uid)` أو `is_active AND is_active_user(uid) AND network_id = profile.network_id` |
| packages | INSERT/UPDATE/DELETE | `network_id = admin_network(uid)` |
| password_reset_requests | ALL/SELECT | `has_role(auth.uid(),'superadmin')` |
| profiles | SELECT | `id = uid OR network_id = admin_network(uid) OR EXISTS(join_requests PENDING لنفس الشبكة)` |
| profiles | INSERT | `id = auth.uid()` |
| profiles | UPDATE | `id = uid OR network_id = admin_network(uid)` |
| profiles | DELETE | `network_id = admin_network(uid)` |
| request_payments | SELECT | عبر الطلب: `r.agent_id = uid OR r.network_id = admin_network(uid)` — بقية العمليات ممنوعة |
| sales | SELECT | `network_id = admin_network(uid) OR agent_id = uid` |
| sales | UPDATE | للمدير حسب الشبكة، وللمندوب على مبيعاته فقط (اسم المشتري/الزبون) — INSERT/DELETE ممنوعة (عبر الدوال) |
| user_roles | SELECT | `user_id = uid` أو مدير نفس الشبكة — بقية العمليات ممنوعة |

كل السياسات موجهة للدور `authenticated` فقط؛ لا يوجد وصول `anon` لأي جدول.

---

## 7. جميع دوال PostgreSQL (كلها SECURITY DEFINER مع `set search_path = public` ما لم يُذكر)

**مساعدة/أمنية:** `has_role(_user_id, _role)`، `is_superadmin(_uid)`، `is_active_user(_user_id)`،
`admin_network(_uid)`، `username_from_phone(_phone)`، `touch_updated_at()` (trigger).

**Triggers:** `handle_new_user()` (إنشاء profile + دور عند التسجيل)، `prevent_non_admin_activation()`،
`prevent_profile_privilege_escalation()`، `restrict_agent_sales_update()`، `touch_updated_at()`.

**الشبكات:** `create_my_network(_name)`، `list_active_networks()`، `admin_delete_network(_network_id)`.

**الباقات والكروت:** `admin_delete_package`، `bulk_upload_cards(_package_id,_entries jsonb)` → (inserted, duplicates, errors)،
`admin_list_cards(...)`، `admin_delete_cards(_ids[,_force])` → (deleted, skipped_sold)، `admin_unassign_cards(_ids)`،
`package_counts(_network_id)` → (available, assigned, sold, my_assigned)، `admin_transfer_sold_cards(_ids,_to_agent)` → (moved, amount).

**الطلبات:** `request_cards(_package_id,_quantity,_notes,_payment_method)`، `approve_card_request(_request_id)` → (approved, remaining)،
`reject_card_request(_request_id,_reason)`، `record_request_payment`، `admin_update_request_payment`، `admin_delete_request_payment`.

**الانضمام:** `approve_join_request(_id)`، `reject_join_request(_id,_reason)`.

**البيع:** `sell_card(_package_id)` → (sale_id, transaction_no, card_username, card_password, package_name, network_name, price, sold_at)،
`record_external_sale(_customer_id,_package_id,_quantity,_card_number,_unit_price,_buyer_name)`،
`delete_sale(_sale_id[,_delete_card])` (خيار إرجاع الكرت للمندوب أو الحذف بلا إرجاع)، `agent_cabin()` (بيانات كبينة البيع).

**الزبائن:** `delete_customer(_customer_id,_delete_cards)`.

**المناديب والحسابات:** `set_agent_active`، `set_agent_network`، `admin_delete_agent`،
`settle_agent_debt(_agent_id,_amount,_note)` → (applied, remaining_debt, payments_count)،
`reconcile_agent_debts(_network_id)` → (created, total_value)، `admin_reset_balance()`، `admin_stats()`، `admin_wipe_database()`.

**مدير التطبيق:** `superadmin_networks()`، `superadmin_agents()`، `superadmin_packages()`، `superadmin_cards(...)`،
`superadmin_stats()`، `superadmin_create_network`، `superadmin_create_package`، `superadmin_update_network`،
`superadmin_set_network_active`، `superadmin_delete_network`، `superadmin_set_agent_active`، `superadmin_delete_agent`،
`superadmin_reset_password(_target_user_id,_new_password)`، `superadmin_reset_requests()`، `superadmin_resolve_reset_request`.

**كلمة السر:** `submit_password_reset_request(_phone,_note)`.

**عدد ملفات الهجرة:** 82 ملف في `supabase/migrations/` (طابع زمني + UUID).

---

## 8. جميع الصفحات (src/routes)

| الملف | المسار | الوصف |
|---|---|---|
| `__root.tsx` | جذر | `<html lang="ar" dir="rtl">`, Head meta (title «كرتي — إدارة وبيع»، theme-color #009688، manifest، OG/Twitter)، QueryClientProvider، AuthProvider، Toaster (sonner)، OfflineBanner، SiteFooter، NotFound 404 عربية، ErrorComponent عربية، تهيئة Sentry / Capacitor / Offline queue / Service Worker |
| `index.tsx` | `/` | صفحة الهبوط/التحويل إلى `/app` أو `/auth` |
| `auth.tsx` | `/auth` | تسجيل الدخول برقم الهاتف + كلمة السر، إنشاء حساب مدير (باسم شبكة) أو مندوب (اختيار شبكة)، «نسيت كلمة السر» → `submit_password_reset_request` |
| `app.tsx` | `/app` (تخطيط) | حارس المصادقة، حالات التحميل/الخطأ، AppShell، تحويل الـ superadmin إجبارياً إلى `/app/superadmin` |
| `app.index.tsx` | `/app` | لوحة الإحصائيات Mobile-First: ملخص الشبكة (فوق أحدث المبيعات)، الديون المستلمة/الرصيد، الرسوم البيانية، أحدث المبيعات، تصدير Excel/PDF. الإحصائيات تستثني المبيعات الخارجية |
| `app.cabin.tsx` | `/app/cabin` | كبينة البيع للمندوب: بيع كرت، **رقم الكرت مخفي حتى إتمام البيع**، إنشاء زبون/اختياره من جهات الاتصال، إرسال الكرت واتساب |
| `app.customers.tsx` | `/app/customers` | إدارة الزبائن، أرصدتهم، إضافة مبلغ خارجي، تسديد الزبون، سجل الدفعات، فاتورة PDF/صورة وإرسالها واتساب |
| `app.packages.tsx` | `/app/packages` | إدارة الباقات (CRUD) مع أعداد المتاح/المسند/المباع |
| `app.cards.tsx` | `/app/cards` | رفع الكروت: يدوي، TXT، CSV، PDF (استخراج تلقائي عبر pdfjs-dist)، معاينة، كشف التكرار |
| `app.manage-cards.tsx` | `/app/manage-cards` | إدارة الكروت: تصفية، تحديد الكل المتاح، طباعة PDF، حذف جماعي، إلغاء إسناد، نقل كروت مباعة بين المناديب، إخفاء/إظهار بيانات الكرت |
| `app.requests.tsx` | `/app/requests` | طلبات الكروت: إنشاء (مندوب)، موافقة/رفض/دفعات (مدير) |
| `app.join-requests.tsx` | `/app/join-requests` | طلبات انضمام المناديب: قبول/رفض |
| `app.sales.tsx` | `/app/sales` | كل المبيعات/مبيعاتي: بحث، فلاتر (زبون/مندوب/حالة)، تحديد جماعي، تعديل/حذف بيع (مع خيار إرجاع الكرت)، تقرير PDF بالمندوب، تمرير سلس رأسي/أفقي، أزرار تمرير عائمة |
| `app.agents.tsx` | `/app/agents` | إدارة المناديب: تفعيل/إيقاف، تعديل الاسم/الهاتف/كلمة السر، حذف نهائي |
| `app.agent-accounts.tsx` | `/app/agent-accounts` | حسابات المناديب: الديون، المسدد، المتبقي، تفاصيل حسب الشبكة |
| `app.payments.tsx` | `/app/payments` | السداد: تسديد دين مندوب، تعديل/حذف عملية سداد، سند PDF، إرسال واتساب (المبلغ المسدَّد + الدين المتبقي) |
| `app.networks.tsx` / `.index.tsx` / `.$id.tsx` | `/app/networks*` | إدارة الشبكة/الشبكات وتفاصيلها |
| `app.mikrotiks.tsx` | `/app/mikrotiks` | إدارة أجهزة MikroTik والاتصال عبر REST API (RouterOS v7+) |
| `app.logs.tsx` | `/app/logs` | سجل العمليات |
| `app.settings.tsx` | `/app/settings` | الإعدادات: نسخة احتياطية/استعادة (للشبكة وللمندوب) مع تأكيد قبل التنزيل، اختيار تطبيق واتساب (رسمي/أعمال/تلقائي)، إعادة تعيين كلمة السر |
| `app.superadmin.tsx` | `/app/superadmin` | مدير التطبيق: كل الشبكات كبطاقات + تفاصيل كل شبكة (مناديب/باقات/كروت/إحصائيات)، تعديل الشبكة والعملة، تعديل كلمة سر ورقم هاتف أي مدير/مندوب، إيقاف/حذف أي شبكة أو مندوب |

---

## 9. جميع المكونات

**مخصصة (`src/components`):**
- `app-shell.tsx` — الهيكل العام: شريط جانبي (Desktop) + Sheet drawer (Mobile) + شريط سفلي، قائمة `NAV` مع أعلام `adminOnly/agentOnly/superOnly`، `PageHeader`، تفعيل `useRealtimeSync`.
  عناصر القائمة: الرئيسية، إدارة التطبيق (super)، الشبكات (admin)، كبينة البيع (agent)، الزبائن (agent)، الباقات، الطلبات، طلبات الانضمام (admin)، المبيعات، رفع الكروت (admin)، إدارة الكروت (admin)، إدارة المناديب (admin)، حسابات المناديب (admin)، السداد (admin)، السجلات (admin)، الإعدادات. عناصر `superOnly` مخفية من الشريط السفلي.
- `dashboard-charts.tsx` — `PackagesChart`, `AgentsChart` (recharts).
- `mobile-data-card.tsx` — `MobileDataCard` + `MobileDataField` لعرض الصفوف كبطاقات على الجوال.
- `card-template-dialog.tsx` — قالب طباعة الكروت.
- `reveal-text.tsx` — إخفاء/إظهار بيانات الكرت الحساسة.
- `refresh-button.tsx` — تحديث يدوي للاستعلامات.
- `offline-banner.tsx` — شريط «لا يوجد اتصال» مع مراعاة safe-area.
- `scroll-container.tsx` — حاوية تمرير ثنائية الأبعاد، إخفاء أشرطة التمرير، سحب بالمؤشر واللمس مع القصور الذاتي (inertia)، خاصية `dragTouch`.
- `site-footer.tsx`.

**shadcn/ui (`src/components/ui`, 45 مكوّن):** accordion, alert, alert-dialog, aspect-ratio, avatar, badge, breadcrumb, button, calendar, card, carousel, chart, checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, form, hover-card, input, input-otp, label, menubar, navigation-menu, pagination, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner (مدة الإشعار ثانيتان), switch, table, tabs, textarea, toggle, toggle-group, tooltip.

---

## 10. جميع الـ Hooks و Contexts

- `useAuth()` + `AuthProvider` (`src/lib/auth-context.tsx`): يحمّل الجلسة والملف الشخصي والدور، إعادة محاولة عند فشل جلب الـprofile، حالات `loading/error`، `usernameToEmail(u)` لتحويل رقم الهاتف إلى بريد داخلي للمصادقة، النوع `Role = admin|agent|superadmin`.
- `useRealtimeSync()` — قناة `global-sync` تستمع لكل التغييرات على: packages, cards, sales, card_requests, join_requests, request_payments, customers, profiles, networks — مع debounce 250ms ثم `queryClient.invalidateQueries()`.
- `useRequestNotifications()` — إشعارات الطلبات الجديدة.
- `useIsMobile()` — كشف الجوال.
- `useUserNames()` — خرائط أسماء المستخدمين حسب `user_id` و`username` (تمنع تكرار المندوب باسمه ورقمه بعد تغيير الهاتف).

---

## 11. جميع الخدمات و Server Functions

**Server Functions (`createServerFn` + middleware `requireSupabaseAuth`):**
- `src/lib/network-backup.functions.ts` → `backupMyNetwork` (نسخة كاملة لشبكة المدير).
- `src/lib/network-restore.functions.ts` → `restoreMyNetwork` (استعادة على شبكتي فقط).
- `src/lib/agent-backup.functions.ts` → `backupMyAgentData`, `restoreMyAgentData`.
- `src/lib/admin-agents.functions.ts` → `adminUpdateAgent` (اسم/هاتف/كلمة سر + تحديث تعاقبي لـ `agent_username` في sales, card_requests, join_requests)، `adminDeleteAgent`.
- `src/lib/superadmin-agents.functions.ts` → `superadminUpdateUserPhone` (نفس التحديث التعاقبي).
- `src/lib/admin-wipe.functions.ts` → `wipeAllData`.

**خدمات المتصفح/الجهاز (`src/lib`):**
- `wa-open.ts` — `openWhatsApp(phone,text)`, `getWaApp/setWaApp` (auto/business/personal) + `WA_APP_LABELS`.
- `pdfmake-report.ts` — بناء تقارير PDF عربية (`ar()` reshaper + RTL)، `buildReportPdfBlob`.
- `receipt-pdf.ts` — سند سداد PDF (`buildCreditReceiptPdfBlob`).
- `customer-invoice-pdf.ts` — فاتورة زبون PDF + `numberToArabicWords`.
- `customer-invoice-image.ts` — `shareInvoiceImageOnWhatsApp` (فاتورة كصورة PNG).
- `card-print.ts` — قوالب طباعة الكروت (`loadTemplate/saveTemplate/clearTemplate`, `printCards`, `printCardsPdf`, `printAssignedCards`).
- `native-pdf.ts` — `isNativeApp`, `openHtmlForPrint`, `sharePdfBlob`, `sharePdfOrPrint`, `saveBlobToDevice` (حفظ في مجلد التنزيلات على أندرويد عبر Filesystem + FileOpener).
- `dashboard-export.ts` — `exportToExcel`, `exportToPDF`.
- `offline-queue.ts` — طابور عمليات محلي: `enqueue`, `enqueueOrRun`, `flushQueue`, `registerOfflineHandler`, `subscribeQueueSize`, `initOfflineQueueAutoSync`.
- `register-sw.ts` — تسجيل Service Worker.
- `capacitor-native.ts` — تهيئة أندرويد: SplashScreen، StatusBar شفاف + safe-area، Deep Links (`appUrlOpen`)، زر الرجوع (إغلاق الحوارات → رجوع → في الرئيسية ضغطتان للخروج مع تلميح).
- `pick-contact.ts` — اختيار زبون من جهات اتصال الهاتف (`unsupported|permission_denied|cancelled|failed`).
- `format.ts` — `fmtMoney` (يلحق `﷼`)، `cleanPhoneLike`، `displayPhone`، `fmtArabicDate`, `fmtArabicDateTime`, `fmtArabicDateTimePdf`.
- `sentry.ts`, `error-capture.ts`, `error-page.ts`, `lovable-error-reporting.ts`, `utils.ts (cn)`.

---

## 12. جميع الصلاحيات

| القدرة | superadmin | admin (مدير شبكة) | agent (مندوب) |
|---|:--:|:--:|:--:|
| رؤية كل الشبكات | ✔ | ✖ | ✖ |
| إنشاء/تعديل/إيقاف/حذف أي شبكة | ✔ | شبكته فقط | ✖ |
| تعديل هاتف/كلمة سر أي مستخدم | ✔ | مناديب شبكته | نفسه |
| رفع/حذف/طباعة الكروت | ✔ (عرض) | ✔ | ✖ |
| الموافقة على طلبات الكروت/الانضمام | ✖ | ✔ | ✖ |
| البيع من الكبينة | ✖ | ✖ | ✔ |
| إدارة الزبائن وسدادهم | ✖ | عرض | ✔ |
| السداد وحسابات المناديب | ✖ | ✔ | ✖ |
| النسخ الاحتياطي | — | لشبكته | لبياناته |
| السجلات | ✖ | ✔ | سجلاته |

الواجهة تخفي غير المصرّح به، والقاعدة تمنعه فعلياً عبر RLS + دوال SECURITY DEFINER.

---

## 13–14. جميع الميزات وقواعد العمل

1. **عزل الشبكات:** كل صف يحمل `network_id`؛ لا وصول عبر الشبكات إطلاقاً.
2. **التسجيل:** رقم الهاتف يُحوَّل إلى `username` عبر `username_from_phone` ثم إلى بريد داخلي للمصادقة؛ كلمة السر مطلوبة. لا تسجيل مجهول.
3. **المندوب الجديد** غير نشط حتى موافقة المدير (`join_requests`).
4. **طلب الكروت:** عند الموافقة تُسند الكروت (`status=ASSIGNED`) وتُسجَّل قيمة الطلب كدين على المندوب (`total_value` مقابل `paid_amount`).
5. **البيع:** `sell_card` يختار كرتاً مسنداً للمندوب، يحوله `SOLD`، ينشئ صف `sales` برقم عملية. **رقم الكرت لا يظهر قبل البيع.**
6. **البيع الخارجي** (`is_external=true`) لا يدخل في إحصائيات لوحة التحكم.
7. **حذف البيع:** خياران — إرجاع الكرت لحساب المندوب، أو حذف بلا إرجاع.
8. **نقل الكروت المباعة** بين المناديب ينقل البيع وملكية الكرت والدين وبيانات الزبون.
9. **الديون:** `settle_agent_debt` يوزّع المبلغ على الطلبات؛ `reconcile_agent_debts` يصحّح الفوارق؛ إمكانية تعديل/حذف عملية سداد.
10. **أرصدة الزبائن:** بيع/مبلغ خارجي يزيد الرصيد، `customer_payments` ينقصه.
11. **واتساب:** إرسال الكرت، الفاتورة (نص/PDF/صورة)، سند السداد، مع اختيار تطبيق واتساب.
12. **رفع الكروت:** يدوي/TXT/CSV/PDF مع استخراج أرقام الكروت من PDF وكشف التكرار عبر `bulk_upload_cards`.
13. **التقارير:** PDF عربي (pdfmake) وExcel لكل المبيعات/الملخصات، مع اختيار المندوب.
14. **السجلات:** كل عملية حساسة تُسجَّل في `logs`.
15. **التاريخ عربي** في كل التطبيق، وكل مبلغ يُتبَع بـ `﷼`.

---

## 15. قواعد التصميم

- RTL كامل (`<html dir="rtl">`) وخط Cairo، حجم الجذر 12px (مضغوط)، `--radius: 0.75rem`.
- توكنات دلالية فقط في `src/styles.css` عبر `@theme inline` و`:root`/`.dark` بصيغة oklch:
  primary تركوازي `#009688`، primary-glow `#14B8A6`، background `#F8FAFC`، foreground `#0F172A`،
  success `#22C55E`، warning `#F59E0B`، destructive `#EF4444`، بالإضافة إلى توكنات sidebar كاملة.
- ظلال وتدرجات معرّفة كتوكنات: `--shadow-soft`, `--shadow-elegant`, `--shadow-glow`, `--gradient-primary`, `--gradient-surface`.
- Utilities مخصصة: `scroll-container`, `sales-scroll`, `card-elegant`, `fade-in`, `drawer-safe-area`.
- متغيرات safe-area: `--app-safe-top`, `--app-safe-bottom` (تُضبط برمجياً على أندرويد).
- ممنوع ألوان مكتوبة يدوياً (`text-white`, `bg-[#...]`).
- Mobile First: بطاقات بدل الجداول على الجوال، شبكة تتكيف 1/2/3 أعمدة، هوامش سفلية كافية فوق الشريط السفلي.

---

## 16. قواعد الأمان

- الأدوار في `user_roles` منفصلة عن `profiles` + trigger `prevent_profile_privilege_escalation`.
- RLS مفعّلة على كل الجداول، بلا وصول `anon`.
- كل العمليات الحساسة عبر دوال `SECURITY DEFINER` مع `set search_path = public` بدل INSERT/DELETE مباشر.
- `SUPABASE_SERVICE_ROLE_KEY` يُستخدم فقط داخل server functions (`client.server.ts`) ولا يصل للمتصفح.
- المصادقة على server functions عبر `requireSupabaseAuth` + `attachSupabaseAuth` في `src/start.ts`.
- بيانات الكرت مخفية افتراضياً (`RevealText`)، ورقم الكرت لا يُكشف قبل البيع.
- التحقق من المدخلات عبر zod + التحقق داخل دوال SQL (كميات، ملكية، حالة، صلاحية).

---

## 17. قواعد الأداء

- React Query: `staleTime 30s`, `gcTime 24h`, `refetchOnWindowFocus: false`, `networkMode: offlineFirst`.
- إعادة المحاولة: تجاهل أخطاء 4xx (عدا 408/429)، 3 محاولات للاستعلامات و2 للطفرات، تأخير أسّي حتى 30s/10s.
- Realtime بـ debounce 250ms لتفادي عاصفة إبطال الكاش.
- فهارس على كل مسارات القراءة الساخنة (مبيعات حسب التاريخ/المندوب، كروت حسب الحالة/الباقة...).
- تحميل كسول للمكتبات الثقيلة (pdfmake، pdfjs، persisters، إضافات Capacitor) عبر `await import`.

## 18. قواعد الـ Offline

- `public/sw.js` (`karti-v2`): NetworkFirst لصفحات HTML مع fallback للكاش، CacheFirst للأصول المجزأة، تجاهل غير GET والطلبات عبر الأصل (Supabase تمر للشبكة).
- SHELL_URLS: `/`, `/app`, `/auth`, `/manifest.webmanifest`, `/favicon.ico`.
- استمرارية كاش React Query في `localStorage` بمفتاح `app.query-cache.v1` (24h) لمفاتيح: packages, cards-available, networks, network فقط (لا بيانات حساسة).
- `offline-queue.ts`: طابور عمليات مؤجلة يُنفَّذ تلقائياً عند عودة الاتصال + `OfflineBanner`.

## 19. قواعد الـ Realtime

- قناة واحدة `global-sync` على 9 جداول، `postgres_changes` لكل الأحداث، إبطال الكاش المجمّع، تنظيف القناة عند إلغاء التركيب.

---

## 20. إعدادات Capacitor (`capacitor.config.ts`)

```ts
appId: "com.mofeed.karti", appName: "كرتي", webDir: ".output/public",
server: { url: "https://arabic-layout-project.onrender.com", androidScheme: "https", cleartext: false,
  allowNavigation: ["arabic-layout-project.onrender.com","*.onrender.com","*.supabase.co","*.lovable.app"] },
android: { allowMixedContent:false, backgroundColor:"#009688", webContentsDebuggingEnabled:false },
plugins: {
  SplashScreen: { launchShowDuration:2000, launchAutoHide:false, backgroundColor:"#009688",
    androidSplashResourceName:"splash", androidScaleType:"CENTER_CROP", showSpinner:true,
    spinnerColor:"#ffffff", splashFullScreen:true, splashImmersive:true },
  StatusBar: { backgroundColor:"#009688", style:"LIGHT", overlaysWebView:true },
  App: { launchUrl: "https://arabic-layout-project.onrender.com" },
}
```
سكربتات البناء: `build-android.cmd` / `build-android.ps1` (install → build → حذف android → `cap add android` → `cap sync android` → `scripts/ensure-capacitor-contacts.mjs` → فتح Android Studio اختيارياً).

## 21. إعدادات PWA

`public/manifest.webmanifest`: الاسم «كرتي»، short_name "WiFi Cards"، start_url `/`، display standalone،
background `#F8FAFC`، theme `#009688`، `lang: ar`، `dir: rtl`، أيقونة favicon.
viewport: `width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover`.

## 22. إعدادات Build

- `vite.config.ts` يستخدم `@lovable.dev/vite-tanstack-config` (يتضمن tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro, componentTagger, حقن VITE_*، alias `@`)؛ يضيف فقط:
  `tanstackStart.server.entry = "server"` و`nitro.preset = "node-server"`.
- سكربتات: `dev`, `build`, `build:dev`, `preview`, `lint`, `format`, `start` (`node .output/server/index.mjs`), `prepare:android`.
- المخرجات: `.output/server/index.mjs` + `.output/public`.

## 23. إعدادات Deploy (`render.yaml`)

خدمة web على Render (خطة free، منطقة frankfurt)، تثبيت Bun في buildCommand ثم
`bun install --frozen-lockfile && bun run build`، تشغيل `node .output/server/index.mjs`، `NODE_VERSION=20`.
متغيرات البيئة تُضبط من لوحة Render. ملاحظة: الخطة المجانية تنام بعد 15 دقيقة خمول.

## 24. جميع متغيرات البيئة

| المتغير | النطاق |
|---|---|
| `VITE_SUPABASE_URL` | متصفح |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | متصفح |
| `VITE_SUPABASE_PROJECT_ID` | متصفح |
| `SUPABASE_URL` | سيرفر |
| `SUPABASE_PUBLISHABLE_KEY` | سيرفر |
| `SUPABASE_PROJECT_ID` | سيرفر |
| `SUPABASE_SERVICE_ROLE_KEY` | سيرفر فقط (لا يُقرأ في المتصفح) |
| `DEPLOY_TARGET`, `NODE_VERSION` | البناء/النشر |

القاعدة: `import.meta.env.VITE_*` في المتصفح، `process.env.*` داخل الـ handlers فقط.

## 25. جميع المكتبات المستخدمة وإصداراتها

انظر `package.json` — أهمها: react 19.2.5، @tanstack/react-router 1.170.16، @tanstack/react-start ^1.168.32،
@tanstack/react-query ^5.101.1 (+persist-client 5.101.1، sync-storage-persister 5.101.1)، tailwindcss 4.2.4،
@tailwindcss/vite 4.2.4، vite 8.0.16، nitro 3.0.260603-beta، @supabase/supabase-js 2.75.0، zod ^3.24.2،
recharts ^2.15.4، pdfmake ^0.3.11، pdfjs-dist ^6.1.200، html2pdf.js ^0.14.0، arabic-persian-reshaper ^1.0.1،
write-excel-file ^4.1.1، date-fns ^4.1.0، sonner ^2.0.7، lucide-react ^0.575.0، @sentry/react ^10.66.0،
@fontsource/cairo ^5.2.7، مجموعة @radix-ui/* الكاملة، Capacitor 8 (core/cli/android + splash-screen, status-bar,
app, filesystem, share, browser, app-launcher, file-opener, @capacitor-community/contacts).
أدوات التطوير: typescript ^5.8.3، eslint 9 + typescript-eslint + prettier، @types/*.

## 26. جميع القرارات المعمارية

1. **TanStack Start فقط** — لا React Router DOM، لا مجلد pages، لا App.tsx؛ التوجيه بالملفات في `src/routes` و`routeTree.gen.ts` مولَّد ولا يُعدَّل.
2. **منطق السيرفر عبر `createServerFn`** لا Supabase Edge Functions؛ المسارات العامة/Webhooks تحت `src/routes/api/public/*` عند الحاجة.
3. **منطق الأعمال الحرج داخل Postgres** كدوال SECURITY DEFINER (ذرية، آمنة، لا يمكن تجاوزها من العميل).
4. **الأدوار في جدول منفصل** لمنع تصعيد الصلاحيات.
5. **العزل متعدد المستأجرين** عبر `network_id` + `admin_network()` في كل سياسة.
6. **Offline-First**: SW + persist cache + طابور عمليات.
7. **Realtime عالمي واحد** بدل اشتراكات متفرقة لكل صفحة.
8. **PDF عربي عبر pdfmake + reshaper** بدل مكتبات لا تدعم تشكيل الحروف العربية.
9. **Capacitor WebView يشير إلى نسخة Render** بدل تعبئة الأصول، لتحديث فوري بلا إعادة بناء APK.
10. **التمرير على أندرويد**: الصفحة نفسها (`<main>`) هي الحاوية الرأسية، والجداول تمرّر أفقياً فقط، لتفادي تعطل الإيماءات داخل WebView.
11. **Nitro node-server** للنشر الخارجي مع بقاء Workers داخل بيئة Lovable.
12. **توكنات تصميم دلالية فقط** لضمان الثيم الفاتح/الداكن وعدم كسر التنسيق.

---

## ملحق: البرومبت الموجز لإعادة البناء

> ابنِ تطبيق TanStack Start (React 19 + Vite + Tailwind v4 + shadcn/ui) عربياً RTL بخط Cairo، Mobile First،
> لإدارة وبيع كروت الإنترنت لعدة شبكات مستقلة، بقاعدة Supabase تحتوي الجداول والدوال والسياسات الموصوفة في
> الأقسام 4–7، والصفحات في القسم 8، والمكونات والـhooks والخدمات في 9–11، بنفس الصلاحيات وقواعد العمل في 12–14،
> ونفس قواعد التصميم والأمان والأداء والـOffline والRealtime في 15–19، وجهّزه للأندرويد عبر Capacitor بالإعدادات في 20
> وللنشر على Render بالإعدادات في 23.
