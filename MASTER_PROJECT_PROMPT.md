# MASTER_PROJECT_PROMPT — "كرتي" (Karti) — نظام إدارة وبيع كروت الإنترنت اللاسلكي

> وثيقة مواصفات كاملة (Master Prompt + Technical Specification) تصف المشروع كما هو موجود حالياً.
> يمكن إعطاء هذه الوثيقة لأي نموذج ذكاء اصطناعي لإعادة بناء المشروع بنسبة 100%.

---

## 1) وصف المشروع بالكامل

**كرتي** تطبيق ويب + أندرويد (PWA + Capacitor) لإدارة وبيع **كروت الإنترنت اللاسلكي (WiFi Vouchers)** لعدة **شبكات مستقلة تماماً** (Multi‑tenant). الواجهة **عربية بالكامل RTL**، **Mobile‑First**، بخط **Cairo**، ولون أساسي **Teal `#009688`**.

### الأدوار الثلاثة
| الدور | الوصف |
|---|---|
| `superadmin` (مدير التطبيق) | يرى كل الشبكات والمناديب والباقات والكروت. لا يرى أي صفحة أخرى غير صفحة الإدارة العامة `/app/superadmin`. |
| `admin` (مدير شبكة) | يملك شبكة واحدة: يرفع الكروت، ينشئ الباقات، يوافق على انضمام المناديب وطلبات الكروت، يدير حسابات وديون وسداد المناديب، السجلات، النسخ الاحتياطي، MikroTik. |
| `agent` (مندوب) | كبينة البيع، زبائنه، مبيعاته، طلب كروت من المدير، إعداداته ونسخته الاحتياطية. |

### دورة العمل الأساسية (Business Flow)
1. مدير ينشئ حساباً باسم الشبكة → تُنشأ الشبكة ويصبح `owner_id` لها ودوره `admin`.
2. مندوب يسجّل ويختار شبكة → يُنشأ `join_requests` بحالة `PENDING` وحسابه `is_active = false`.
3. المدير يوافق (`approve_join_request`) → يُربط المندوب بالشبكة `profiles.network_id` ويصبح نشطاً.
4. المدير يرفع كروتاً (TXT/CSV/PDF/يدوي) عبر `bulk_upload_cards` إلى باقة معيّنة، حالتها `AVAILABLE`.
5. المندوب يطلب كروتاً (`request_cards`) بطريقة دفع `CASH` أو `CREDIT` → المدير يوافق (`approve_card_request`) فتُسند كروت `ASSIGNED` للمندوب وتُسجّل قيمة الطلب كدين إن كان `CREDIT`.
6. المندوب يبيع من **كبينة البيع** (`sell_card`) → الكرت `SOLD`، يُنشأ صف في `sales` برقم عملية فريد، ويظهر رقم الكرت **فقط بعد إتمام البيع**.
7. الزبائن: المندوب ينشئ زبوناً (يدوياً أو من جهات الاتصال)، يبيع له، يضيف مبالغ خارجية، يستلم تسديداً، ويرسل كشف/فاتورة عبر واتساب (صورة PNG أو PDF).
8. المدير يسدّد ديون المناديب (`settle_agent_debt` / `record_request_payment`) ويطبع سند سداد PDF ويرسله واتساب.

---

## 2) التقنيات المستخدمة (مع الإصدارات)

- **TanStack Start** `^1.168.32` + **TanStack Router** `1.170.16` + `@tanstack/router-plugin` `1.168.18`
- **React** `19.2.5` / **React DOM** `19.2.5`
- **Vite** `8.0.16` عبر `@lovable.dev/vite-tanstack-config` `2.8.5`، و**Nitro** `3.0.260603-beta` بـ preset `node-server`
- **TypeScript** `^5.8.3`
- **Tailwind CSS v4** `4.2.4` + `@tailwindcss/vite` + `tw-animate-css` — بدون `tailwind.config.js` (كل شيء في `src/styles.css`)
- **shadcn/ui** فوق **Radix UI** (46 مكوّن)
- **Supabase JS** `2.75.0` (Lovable Cloud)
- **TanStack Query** `^5.101.1` + `react-query-persist-client` + `query-sync-storage-persister` `5.101.1`
- **Capacitor 8**: `@capacitor/core|cli|android` `^8.4.2`, `app`, `app-launcher`, `browser`, `filesystem`, `share`, `splash-screen`, `status-bar`, `@capacitor-community/contacts` `^8.0.0`, `@capacitor-community/file-opener` `^8.0.1`
- **PDF**: `pdfmake` `^0.3.11` (+ `@types/pdfmake`), `pdfjs-dist` `^6.1.200` (استخراج الكروت من PDF)، `html2pdf.js` `^0.14.0`، `arabic-persian-reshaper` `^1.0.1` (تشكيل الحروف العربية في PDF)
- **Excel**: `write-excel-file` `^4.1.1`
- **رسوم بيانية**: `recharts` `^2.15.4`
- **نماذج**: `react-hook-form` `^7.71.2` + `@hookform/resolvers` + `zod` `^3.24.2`
- **UI مساعد**: `lucide-react` `^0.575.0`، `sonner` `^2.0.7`، `cmdk`، `vaul`، `embla-carousel-react`، `input-otp`، `react-day-picker`، `react-resizable-panels`، `class-variance-authority`، `clsx`، `tailwind-merge`، `date-fns`
- **الخط**: `@fontsource/cairo` `^5.2.7` (أوزان 400/500/600/700/800)
- **المراقبة**: `@sentry/react` `^10.66.0`
- **الجودة**: ESLint 9 + typescript-eslint + prettier + eslint-plugin-react-hooks/react-refresh
- **مدير الحزم**: Bun (مثبّت بـ `--frozen-lockfile` على Render)

---

## 3) هيكل المشروع بالكامل

```text
.
├── AGENTS.md, BUILD_APK.md, DEPLOY_RENDER.md, DEPLOY_RENDER_APK.md
├── build-android.cmd / build-android.ps1        # سكربتات بناء APK
├── capacitor.config.ts
├── render.yaml                                   # نشر Render (node-server)
├── vite.config.ts                                # Nitro node-server + entry=src/server.ts
├── components.json, eslint.config.js, .prettierrc, tsconfig.json, bunfig.toml
├── scripts/ensure-capacitor-contacts.mjs         # يضمن تركيب إضافة جهات الاتصال قبل بناء أندرويد
├── public/
│   ├── manifest.webmanifest                      # PWA عربي RTL
│   ├── sw.js                                     # Service Worker (karti-v2)
│   ├── app-icon.png, favicon.ico
├── supabase/config.toml
└── src/
    ├── server.ts        # غلاف SSR: يحوّل أخطاء h3 المبتلعة إلى صفحة خطأ HTML
    ├── start.ts         # createStart: functionMiddleware=[attachSupabaseAuth], requestMiddleware=[errorMiddleware]
    ├── router.tsx       # QueryClient + persistence + createRouter
    ├── routeTree.gen.ts # مولَّد — ممنوع تعديله
    ├── styles.css       # Tailwind v4 theme (design tokens)
    ├── integrations/supabase/{client,client.server,auth-middleware,auth-attacher,types}.ts  # مولَّدة
    ├── routes/          # 23 ملف (انظر §8)
    ├── components/      # 9 مكوّنات + ui/ (46 مكوّن shadcn)
    ├── hooks/           # use-mobile, use-realtime-sync, use-request-notifications
    └── lib/             # 26 ملف: خدمات، سيرفر فنكشنز، PDF، واتساب، أوفلاين…
```

---

## 4) قاعدة البيانات كاملة (PostgreSQL / Supabase)

### 4.1 الأنواع المخصصة (ENUM)
```sql
create type public.app_role   as enum ('admin','agent','superadmin');
create type public.card_status as enum ('AVAILABLE','ASSIGNED','SOLD');
```

### 4.2 الجداول (14 جدول في `public`)

**networks** — الشبكات
`id uuid pk`, `name text not null`, `description text`, `currency text not null`, `primary_color text not null`, `secondary_color text not null`, `logo_url text`, `cover_url text`, `is_active bool not null`, `created_by uuid → auth.users`, `owner_id uuid → auth.users`, `created_at`, `updated_at`.
فهارس: `networks_name_lower_uidx UNIQUE(lower(name))`, `networks_owner_idx(owner_id)`. تريجر: `networks_touch`.

**profiles** — المستخدمون
`id uuid pk → auth.users`, `username text unique not null` (بصيغة `u<digits>`), `full_name text`, `phone text`, `is_active bool not null`, `network_id uuid → networks`, `created_at`, `updated_at`.
فهارس: `profiles_username_key`, `profiles_network_idx`. تريجرات: `profiles_touch`, `prevent_non_admin_activation`, `profiles_prevent_privilege_escalation`, `trg_prevent_profile_privilege_escalation`.

**user_roles** — الأدوار (منفصلة عن profiles منعاً لتصعيد الصلاحيات)
`id uuid pk`, `user_id uuid → auth.users`, `role app_role`, `created_at`, `unique(user_id, role)`.

**packages** — الباقات
`id`, `network_id → networks`, `name`, `price numeric check(price >= 0)`, `data_size`, `speed`, `validity`, `allowed_time`, `description`, `color`, `icon`, `sort_order int`, `is_active bool`, `created_at`, `updated_at`. فهرس `packages_network_idx`. تريجر `packages_touch`.

**cards** — الكروت
`id`, `package_id → packages`, `network_id → networks`, `username text not null`, `password text`, `status card_status`, `sold_to uuid`, `sold_at`, `assigned_to uuid`, `assigned_at`, `created_at`.
قيود/فهارس: `UNIQUE(package_id, username)`, `cards_pkg_status_idx(package_id,status)`, `cards_sold_to_idx`, `cards_assigned_to_idx(assigned_to,package_id) WHERE status='ASSIGNED'`.

**card_requests** — طلبات الكروت
`id`, `agent_id`, `agent_username`, `package_id`, `network_id`, `package_name`, `network_name`, `quantity int check(>0)`, `approved_quantity int`, `status text check in (PENDING,APPROVED,REJECTED)`, `notes`, `reject_reason`, `decided_by`, `decided_at`, `payment_method text check in (CASH,CREDIT)`, `unit_price numeric`, `total_value numeric`, `paid_amount numeric`, `created_at`, `updated_at`.
فهارس: `(status, created_at desc)`, `(agent_id, created_at desc)`. تريجر `card_requests_touch`.

**request_payments** — دفعات سداد الطلبات
`id`, `request_id → card_requests`, `amount numeric check(<>0/ >0)`, `note`, `recorded_by`, `recorded_by_username`, `created_at`. للقراءة فقط من التطبيق (تُكتب عبر RPC).

**join_requests** — طلبات انضمام المناديب
`id`, `network_id`, `agent_id`, `agent_username`, `agent_full_name`, `agent_phone`, `status (PENDING/APPROVED/REJECTED)`, `reject_reason`, `requested_at`, `decided_at`, `decided_by`. فهارس `(network_id,status)`, `(agent_id)`.

**sales** — المبيعات
`id`, `transaction_no text unique`, `card_id → cards`, `package_id`, `network_id`, `agent_id`, `price numeric`, `package_name`, `network_name`, `agent_username`, `sold_at`, `buyer_name`, `customer_id → customers`, `card_number text`, `is_external bool not null`.
فهارس: `sales_agent_idx`, `sales_pkg_idx`, `sales_date_idx(sold_at desc)`, `sales_customer_idx`. تريجر `trg_restrict_agent_sales_update`.

**customers** — الزبائن
`id`, `agent_id`, `network_id`, `name`, `whatsapp`, `created_at`, `updated_at`. فهرس `customers_agent_idx`. تريجر `customers_touch_updated_at`.

**customer_payments** — تسديدات/مبالغ الزبائن
`id`, `customer_id → customers`, `agent_id`, `network_id`, `amount numeric check(<>0)` (موجب = تسديد، سالب = إضافة مبلغ)، `note`, `created_at`. فهارس على `customer_id` و`agent_id`.

**mikrotiks** — أجهزة الميكروتك
`id`, `network_id`, `name`, `host`, `username`, `password`, `port int`, `use_https bool`, `notes`, `created_by`, `created_at`, `updated_at`. تريجر `mikrotiks_touch_updated_at`.

**password_reset_requests** — طلبات استعادة كلمة السر
`id`, `phone`, `note`, `status`, `resolved_by`, `resolved_at`, `created_at`.

**logs** — السجلات
`id`, `user_id`, `actor_username`, `action`, `entity`, `entity_id`, `metadata jsonb`, `created_at`. فهرس `logs_created_idx(created_at desc)`.

### 4.3 العلاقات (Foreign Keys)
```text
profiles.id → auth.users.id           profiles.network_id → networks.id
user_roles.user_id → auth.users.id    networks.owner_id/created_by → auth.users.id
packages.network_id → networks.id
cards.package_id → packages.id  cards.network_id → networks.id
cards.assigned_to/sold_to → auth.users.id
card_requests.package_id → packages.id  .network_id → networks.id
card_requests.agent_id/decided_by → auth.users.id
request_payments.request_id → card_requests.id
join_requests.network_id → networks.id  .agent_id/.decided_by → auth.users.id
sales.card_id → cards.id  .package_id → packages.id  .network_id → networks.id
sales.agent_id → auth.users.id  .customer_id → customers.id
customers.agent_id → auth.users.id  .network_id → networks.id
customer_payments.customer_id → customers.id
mikrotiks.network_id → networks.id
logs.user_id → auth.users.id
```

### 4.4 GRANTs
كل جدول في `public`: `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated;` و`GRANT ALL ... TO service_role;` — بدون منح `anon` (كل السياسات مقيّدة بـ `auth.uid()`).

---

## 5) سياسات RLS (RLS مفعّل على كل الجداول)

الدوال المساعدة: `admin_network(uid)` تُعيد `network_id` للشبكة التي يديرها المستخدم، `is_active_user(uid)`، `has_role(uid, role)`، `is_superadmin(uid)` — كلها `security definer`.

```sql
-- card_requests
"cr read"          SELECT : agent_id = auth.uid() OR network_id = admin_network(auth.uid())
"cr agent insert"  INSERT : CHECK agent_id = auth.uid() AND is_active_user(auth.uid())
"cr admin update"  UPDATE : network_id = admin_network(auth.uid())  (USING + CHECK)
"cr admin delete"  DELETE : network_id = admin_network(auth.uid())

-- cards
"cards read"   SELECT : network_id = admin_network(auth.uid()) OR assigned_to = auth.uid() OR sold_to = auth.uid()
"cards admin insert/update/delete" : network_id = admin_network(auth.uid())

-- customers
"agents manage own customers"  ALL   : agent_id = auth.uid()
"admins view network customers" SELECT: network_id IS NOT NULL AND network_id = admin_network(auth.uid())

-- customer_payments  (نفس منطق customers)
"agents manage own customer payments" ALL / "admins view network customer payments" SELECT

-- join_requests
"jr read"         SELECT : agent_id = auth.uid() OR network_id = admin_network(auth.uid())
"jr admin update" UPDATE : network_id = admin_network(auth.uid())
-- لا INSERT ولا DELETE (تُنشأ عبر RPC/تريجر)

-- logs
"logs read"         SELECT : user_id = auth.uid() OR EXISTS(profiles p: p.id=logs.user_id AND p.network_id=admin_network(auth.uid()))
"logs admin delete" DELETE : نفس شرط شبكة المدير   -- لا INSERT/UPDATE

-- mikrotiks : كل العمليات مقيدة بـ network_id = admin_network(auth.uid())

-- networks
"networks read own" SELECT : owner_id = auth.uid() OR id = (select network_id from profiles where id = auth.uid())
"networks owner update/delete" : owner_id = auth.uid()   -- لا INSERT (عبر RPC فقط)

-- packages
"packages read" SELECT : network_id = admin_network(auth.uid())
                          OR (is_active AND is_active_user(auth.uid()) AND network_id = (select network_id from profiles where id = auth.uid()))
"packages admin write/update/delete" : network_id = admin_network(auth.uid())

-- password_reset_requests
"superadmin_reads_reset_requests"   SELECT : has_role(auth.uid(),'superadmin')
"superadmin_manages_reset_requests" ALL    : has_role(auth.uid(),'superadmin')

-- profiles
"profiles read"  SELECT : id = auth.uid() OR network_id = admin_network(auth.uid())
                          OR EXISTS(join_requests jr: jr.agent_id = profiles.id AND jr.network_id = admin_network(auth.uid()) AND jr.status='PENDING')
"profiles self insert" INSERT : CHECK id = auth.uid()
"profiles update" UPDATE : id = auth.uid() OR network_id = admin_network(auth.uid())
"profiles admin delete" DELETE : network_id = admin_network(auth.uid())

-- request_payments
"rp read" SELECT : EXISTS(card_requests r: r.id = request_id AND (r.agent_id = auth.uid() OR r.network_id = admin_network(auth.uid())))

-- sales
"sales read" SELECT : network_id = admin_network(auth.uid()) OR agent_id = auth.uid()
"admin update sales in network" UPDATE : network_id = admin_network(auth.uid())
"agents update own sale customer" / "sales update buyer_name by agent" UPDATE : agent_id = auth.uid()
-- لا INSERT ولا DELETE مباشرة (RPC فقط: sell_card / record_external_sale / delete_sale)

-- user_roles
"user_roles read" SELECT : user_id = auth.uid() OR EXISTS(profiles p: p.id=user_id AND p.network_id=admin_network(auth.uid()))
-- لا INSERT/UPDATE/DELETE مطلقاً من العميل
```

---

## 6) التريجرات والقيود

**Triggers**
| التريجر | الجدول | الدالة |
|---|---|---|
| `profiles_touch`, `networks_touch`, `packages_touch`, `card_requests_touch`, `customers_touch_updated_at`, `mikrotiks_touch_updated_at` | الجداول المقابلة | `touch_updated_at()` |
| `prevent_non_admin_activation`, `profiles_prevent_privilege_escalation` | profiles | `prevent_non_admin_activation()` — لا يستطيع مستخدم تفعيل نفسه |
| `trg_prevent_profile_privilege_escalation` | profiles | `prevent_profile_privilege_escalation()` — منع تغيير `network_id`/`is_active` ذاتياً |
| `trg_restrict_agent_sales_update` | sales | `restrict_agent_sales_update()` — المندوب لا يعدّل إلا اسم المشتري/الزبون |
| (على `auth.users`) | — | `handle_new_user()` — ينشئ profile + دور + طلب انضمام/شبكة |

**CHECK / UNIQUE**
`packages.price >= 0` · `card_requests.quantity > 0` · `card_requests.status IN (PENDING,APPROVED,REJECTED)` · `card_requests.payment_method IN (CASH,CREDIT)` · `request_payments.amount > 0` · `customer_payments.amount <> 0` · `join_requests.status IN (...)` · `profiles.username UNIQUE` · `user_roles(user_id, role) UNIQUE` · `cards(package_id, username) UNIQUE` · `sales.transaction_no UNIQUE` · `networks lower(name) UNIQUE`.

---

## 7) جميع دوال PostgreSQL (كلها `SECURITY DEFINER` مع `set search_path = public` إلا `touch_updated_at`)

**الصلاحيات والمساعدات**
`has_role(_user_id uuid,_role app_role) → bool` · `is_superadmin(_uid) → bool` · `is_active_user(_user_id) → bool` · `admin_network(_uid) → uuid` · `username_from_phone(_phone text) → text` · `touch_updated_at() → trigger` · `handle_new_user() → trigger` · `prevent_non_admin_activation()` · `prevent_profile_privilege_escalation()` · `restrict_agent_sales_update()`

**الشبكات**
`create_my_network(_name) → uuid` · `list_active_networks() → (id,name)` · `superadmin_create_network(_name,_currency) → uuid` · `superadmin_update_network(_network_id,_name,_currency)` · `superadmin_set_network_active(_network_id,_active)` · `superadmin_delete_network(_network_id) → jsonb` · `admin_delete_network(_network_id)` · `superadmin_networks() → جدول إحصائي لكل شبكة (المناديب/الباقات/الكروت/المباع/قيمة المبيعات/المالك)`

**الباقات**
`superadmin_create_package(...)` · `admin_delete_package(_package_id)` · `package_counts(_network_id) → (package_id, available, assigned, sold, my_assigned)` · `superadmin_packages()`

**الكروت**
`bulk_upload_cards(_package_id,_entries jsonb) → (inserted, duplicates, errors)` · `admin_list_cards(...)` · `superadmin_cards(...)` · `admin_delete_cards(_ids[])` و`admin_delete_cards(_ids[],_force)` → `(deleted, skipped_sold)` · `admin_unassign_cards(_ids[]) → int` · `admin_transfer_sold_cards(_ids[],_to_agent) → (moved, amount)`

**الطلبات والبيع**
`request_cards(_package_id,_quantity,_notes,_payment_method) → uuid` · `approve_card_request(_request_id) → (approved, remaining)` · `reject_card_request(_request_id,_reason)` · `sell_card(_package_id) → (sale_id, transaction_no, card_username, card_password, package_name, network_name, price, sold_at)` · `record_external_sale(_customer_id,_package_id,_quantity,_card_number,_unit_price,_buyer_name) → int` · `delete_sale(_sale_id)` و`delete_sale(_sale_id,_delete_card bool)` (إرجاع الكرت للمندوب أو حذفه) · `agent_cabin() → بيانات كبينة البيع لكل باقة`

**المناديب والحسابات**
`approve_join_request(_id)` · `reject_join_request(_id,_reason)` · `set_agent_active(_agent_id,_active)` · `set_agent_network(_agent_id,_network_id)` · `admin_delete_agent(_agent_id) → jsonb` · `superadmin_delete_agent(_agent_id) → jsonb` · `superadmin_set_agent_active(...)` · `superadmin_agents()` · `reconcile_agent_debts(_network_id) → (created, total_value)`

**السداد والأرصدة**
`record_request_payment(_request_id,_amount,_note) → (paid_amount, remaining)` · `admin_update_request_payment(...)` · `admin_delete_request_payment(_payment_id)` · `settle_agent_debt(_agent_id,_amount,_note) → (applied, remaining_debt, payments_count)` · `admin_reset_balance() → (cleared, requests_updated, payments_deleted)`

**الإحصاءات والصيانة**
`admin_stats() → jsonb` · `superadmin_stats() → jsonb` · `admin_wipe_database() → jsonb`

**كلمات السر**
`submit_password_reset_request(_phone,_note)` · `superadmin_reset_requests()` · `superadmin_resolve_reset_request(_id,_status)` · `superadmin_reset_password(_target_user_id,_new_password)`

---

## 8) جميع الصفحات (Routes) — `src/routes` (توجيه بالملفات)

| الملف | المسار | الوصف |
|---|---|---|
| `__root.tsx` | root | `<html lang="ar" dir="rtl">`, Head/SEO, خطوط Cairo, `QueryClientProvider`, `AuthProvider`, `Toaster`(sonner), `OfflineBanner`, `SiteFooter`, تهيئة Sentry/SW/Offline‑queue/Capacitor، إعادة تحميل تلقائية عند فشل تحميل chunk بعد النشر، `NotFoundComponent` و`ErrorComponent` عربيين. |
| `index.tsx` | `/` | صفحة الهبوط/التحويل إلى `/app` أو `/auth`. |
| `auth.tsx` | `/auth` | تسجيل الدخول **برقم الهاتف + كلمة السر**، إنشاء حساب مدير (باسم شبكة) أو مندوب (باختيار شبكة من `list_active_networks`)، ونسيت كلمة السر (`submit_password_reset_request`). |
| `app.tsx` | `/app` | تخطيط محمي: يتحقق من الجلسة والبروفايل، يوجّه `superadmin` إجبارياً إلى `/app/superadmin`، يعرض حالات التحميل/الخطأ/الحساب الموقوف، ويغلّف الأبناء بـ `AppShell`. |
| `app.index.tsx` | `/app` | **لوحة الإحصائيات**: ملخص الشبكة (المبيعات، المتاح، المسند، المباع، الديون، **الرصيد**، المسدد)، رسوم بيانية (`PackagesChart`, `AgentsChart`)، أحدث المبيعات، تصدير Excel/PDF، `admin_stats`, `admin_reset_balance`. يستثني المبيعات الخارجية `is_external`. |
| `app.superadmin.tsx` | `/app/superadmin` | **إدارة التطبيق**: كل الشبكات ككروت موبايل + تفاصيل كل شبكة (`NetworkDetail`) بتبويبات المناديب/الباقات/الكروت، تعديل اسم الشبكة والعملة، إيقاف/حذف شبكة أو مندوب، تعديل هاتف وكلمة سر أي مستخدم. |
| `app.networks.tsx` / `.index.tsx` / `.$id.tsx` | `/app/networks`, `/app/networks/$id` | تخطيط + قائمة الشبكات + صفحة شبكة (باقاتها، عدّاداتها، طلب/بيع). |
| `app.packages.tsx` | `/app/packages` | إدارة الباقات (اسم، سعر، حجم، سرعة، صلاحية، وقت مسموح، لون)، عدّادات المخزون، طلب كروت. |
| `app.cards.tsx` | `/app/cards` | **رفع الكروت**: لصق يدوي، ملفات TXT/CSV، واستخراج تلقائي من **PDF** عبر `pdfjs-dist`؛ يستدعي `bulk_upload_cards` ويعرض (مُدرج/مكرر/أخطاء). تمرير عمودي أصلي وهامش سفلي كبير حتى لا يختفي زر الرفع خلف القائمة السفلية. |
| `app.manage-cards.tsx` | `/app/manage-cards` | **إدارة الكروت**: بحث وفلترة (شبكة/باقة/حالة/مندوب)، تحديد الكل/المتاح، طباعة PDF، حذف جماعي، إلغاء إسناد، نقل كروت مباعة بين المناديب. |
| `app.requests.tsx` | `/app/requests` | طلبات الكروت: موافقة/رفض، تسجيل دفعات (`record_request_payment`). |
| `app.join-requests.tsx` | `/app/join-requests` | طلبات انضمام المناديب: موافقة/رفض. |
| `app.agents.tsx` | `/app/agents` | إدارة المناديب: تفعيل/إيقاف، تغيير الشبكة، تعديل الاسم/الهاتف/كلمة السر، حذف نهائي. |
| `app.agent-accounts.tsx` | `/app/agent-accounts` | حسابات المناديب: الديون والمسدد والرصيد لكل مندوب حسب الشبكة، `reconcile_agent_debts`. |
| `app.payments.tsx` | `/app/payments` | **السداد**: تسديد دين مندوب، تعديل/حذف عملية تسديد، طباعة سند PDF وإرساله واتساب (المبلغ المسدَّد + الدين المتبقي). |
| `app.cabin.tsx` | `/app/cabin` | **كبينة البيع** للمندوب: باقاته وأرصدته، بيع (`sell_card`) — **رقم الكرت مخفي حتى إتمام البيع**، إنشاء/اختيار زبون (من جهات الاتصال أو يدوي)، إرسال الكرت واتساب. |
| `app.customers.tsx` | `/app/customers` | الزبائن: إنشاء/حذف، رصيد الزبون، إضافة مبلغ خارجي، تسديد الزبون، سجل الدفعات، كشف حساب PNG/PDF عبر واتساب. |
| `app.sales.tsx` | `/app/sales` | كل المبيعات/مبيعاتي: فلترة بالمندوب (بمعرّف المستخدم لا بالاسم المخزَّن)، بحث وتاريخ، حذف بيع (إرجاع الكرت أو بدونه)، تقرير PDF منسّق بالعربية، تمرير أصلي عمودي وأفقي داخل الجدول. |
| `app.logs.tsx` | `/app/logs` | السجلات: من فعل ماذا ومتى، مع بيانات المبيعات. |
| `app.mikrotiks.tsx` | `/app/mikrotiks` | إدارة أجهزة MikroTik (RouterOS v7+ REST API): host, port, https, بيانات الدخول، ملاحظات. |
| `app.settings.tsx` | `/app/settings` | الإعدادات: الملف الشخصي، تغيير كلمة السر، اختيار تطبيق واتساب (تلقائي/أعمال/عادي)، النسخ الاحتياطي والاستعادة (شبكة للمدير، بيانات المندوب للمندوب) مع نافذة تأكيد وحفظ في مجلد التنزيلات على أندرويد. |

---

## 9) جميع المكونات

**مكوّنات المشروع (`src/components`)**
- `app-shell.tsx` — الهيكل العام: شريط علوي، قائمة جانبية سطح المكتب قابلة للطي، Sheet جانبي للموبايل (RTL، جهة اليمين)، **شريط سفلي بأربعة عناصر** على الموبايل، تبديل الوضع الليلي، معلومات المستخدم وتسجيل الخروج، احترام `safe-area-inset`. يصفّي عناصر القائمة حسب `adminOnly / agentOnly / superOnly`، ويخفي "إدارة التطبيق" من الشريط السفلي. يصدّر أيضاً `PageHeader`.
- `dashboard-charts.tsx` — `PackagesChart` و`AgentsChart` (Recharts).
- `mobile-data-card.tsx` — بديل الجداول على الموبايل (`MobileDataField`).
- `scroll-container.tsx` — حاوية تمرير ثنائية الاتجاه محسّنة للمس داخل WebView.
- `reveal-text.tsx` — إخفاء بيانات الكروت مع زر إظهار.
- `refresh-button.tsx` — تحديث يدوي للبيانات.
- `offline-banner.tsx` — شريط "لا يوجد اتصال" + عدد العمليات المؤجلة.
- `card-template-dialog.tsx` — قالب طباعة الكروت (خلفية، أبعاد، مواضع النصوص).
- `site-footer.tsx` — تذييل عام.

**مكوّنات shadcn/ui (`src/components/ui`, 46 ملفاً)**
accordion, alert, alert-dialog, aspect-ratio, avatar, badge, breadcrumb, button, calendar, card, carousel, chart, checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, form, hover-card, input, input-otp, label, menubar, navigation-menu, pagination, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner, switch, table, tabs, textarea, toggle, toggle-group, tooltip.
> `sonner` مضبوط على مدة ظهور **ثانيتين**. `table.tsx` بلا قيود `touch-action` ليعمل التمرير الأصلي.

---

## 10) جميع الـ Hooks و Contexts

- **`AuthProvider` / `useAuth`** (`src/lib/auth-context.tsx`): يحمل الجلسة والبروفايل والأدوار، `usernameToEmail(u) = <u>@wificards.local`، إعادة محاولة تحميل البروفايل 3 مرات بـ backoff (800ms×2^i)، `profileError`، مؤقت أمان 10 ثوانٍ، `signOut` ينظّف مفاتيح `sb-*` من localStorage ثم `location.href="/auth"`. الدور الفعّال: admin > agent > superadmin، مع `isSuperadmin` منفصلة.
- **`useRealtimeSync`** (`src/hooks/use-realtime-sync.ts`): قناة `global-sync` تستمع لكل تغييرات `postgres_changes` على: packages, cards, sales, card_requests, join_requests, request_payments, customers, profiles, networks — وتبطل كاش React Query بـ debounce 250ms.
- **`useRequestNotifications`**: تنبيهات فورية للطلبات الجديدة/المعتمدة.
- **`useIsMobile`**: كشف حجم الشاشة.
- **`useUserNames`** (`src/lib/use-user-names.ts`): خريطتان `byUsername` و`byId` لاسم العرض — تحل مشكلة تكرار المندوب بعد تغيير رقم هاتفه (لأن `username` لقطة تاريخية في `sales`).

---

## 11) جميع الخدمات و Server Functions

**Server Functions (`createServerFn` + `requireSupabaseAuth`)**
- `src/lib/admin-agents.functions.ts` → `adminUpdateAgent` (اسم/هاتف/كلمة سر مع تحديث `email`, `username`، ومزامنة `agent_username` في sales/card_requests/join_requests)، `adminDeleteAgent`.
- `src/lib/superadmin-agents.functions.ts` → `superadminUpdateUserPhone` (يتحقق `is_superadmin`، يحوّل الهاتف إلى `u<digits>` + `@wificards.local`، يمنع التكرار، ويحدّث اللقطات التاريخية).
- `src/lib/network-backup.functions.ts` → `backupMyNetwork` (JSON كامل للشبكة).
- `src/lib/network-restore.functions.ts` → `restoreMyNetwork` (استعادة على شبكتي فقط).
- `src/lib/agent-backup.functions.ts` → `backupMyAgentData`, `restoreMyAgentData`.
- `src/lib/admin-wipe.functions.ts` → `wipeAllData`.
> `supabaseAdmin` يُستورد ديناميكياً **داخل** الـ handler فقط (`await import("@/integrations/supabase/client.server")`).

**خدمات العميل (`src/lib`)**
- `format.ts`: `fmtMoney` (يلحق رمز الريال ﷼)، `cleanPhoneLike`, `displayPhone`, `fmtArabicDate`, `fmtArabicDateTime`, `fmtArabicDateTimePdf` (اليوم/الشهر/السنة بالعربية).
- `pdfmake-report.ts`: `ar()` لتشكيل العربية، `buildReportPdfBlob` (جداول وملخصات RTL).
- `receipt-pdf.ts`: `buildCreditReceiptPdfBlob` — سند سداد.
- `customer-invoice-pdf.ts`: `buildCustomerInvoicePdfBlob` + `numberToArabicWords`.
- `customer-invoice-image.ts`: `shareInvoiceImageOnWhatsApp` — كشف حساب كصورة PNG (اسم الشبكة/الباقة/السعر/الكمية + توقيع "فريق شبكة الزري نت اللاسلكية").
- `card-print.ts`: قوالب طباعة الكروت (`loadTemplate/saveTemplate/clearTemplate`, `printCards`, `printCardsPdf`, `printAssignedCards`).
- `native-pdf.ts`: `isNativeApp`, `openHtmlForPrint`, `sharePdfOrPrint`, `sharePdfBlob`, `saveBlobToDevice` (حفظ في مجلد التنزيلات عبر Filesystem + FileOpener).
- `wa-open.ts`: `openWhatsApp` مع اختيار التطبيق `auto | business | personal` (محفوظ محلياً).
- `pick-contact.ts`: `pickContact()` عبر `@capacitor-community/contacts` مع معالجة الأذونات.
- `dashboard-export.ts`: `exportToExcel`, `exportToPDF`.
- `offline-queue.ts`: طابور عمليات مؤجّلة (`enqueue`, `enqueueOrRun`, `flushQueue`, `registerOfflineHandler`, `subscribeQueueSize`, `initOfflineQueueAutoSync`).
- `register-sw.ts`, `capacitor-native.ts`, `sentry.ts`, `error-capture.ts`, `error-page.ts`, `lovable-error-reporting.ts`, `utils.ts (cn)`.

---

## 12) الصلاحيات (مصفوفة)

| الميزة | superadmin | admin | agent |
|---|:--:|:--:|:--:|
| صفحة الإدارة العامة | ✅ (فقط هي) | ❌ | ❌ |
| إنشاء/تعديل/إيقاف/حذف شبكة | ✅ | تعديل شبكته | ❌ |
| رفع الكروت وإدارتها | ✅ عرض | ✅ | ❌ |
| الباقات | ✅ عرض/إنشاء | ✅ | عرض النشطة |
| الموافقة على طلبات الكروت/الانضمام | — | ✅ | ❌ |
| كبينة البيع والزبائن | ❌ | ❌ | ✅ |
| السداد وحسابات المناديب | — | ✅ | عرض دينه |
| السجلات | — | ✅ | سجلّه فقط |
| تعديل كلمة سر/هاتف أي مستخدم | ✅ | لمناديب شبكته | لنفسه |
| النسخ الاحتياطي | — | شبكته | بياناته |

---

## 13) الميزات (قائمة كاملة)
شبكات متعددة معزولة · إدارة الباقات · رفع الكروت من TXT/CSV/PDF/يدوي مع كشف المكرر · إدارة مخزون الكروت وإسنادها وإلغاء إسنادها ونقل المباع بين المناديب · طلبات كروت نقداً/آجل · كبينة بيع فورية · إدارة الزبائن وأرصدتهم ودفعاتهم ومبالغهم الخارجية · فواتير وكشوف واتساب (PNG/PDF) · مبيعات وتقارير PDF/Excel · لوحة إحصائيات مع رسوم بيانية · ديون المناديب والسداد وسندات السداد · طلبات الانضمام · سجلات العمليات · إعدادات وتغيير كلمة السر واستعادتها · نسخ احتياطي واستعادة (شبكة/مندوب) · تكامل MikroTik · وضع ليلي · PWA وعمل بدون إنترنت · تحديث فوري Realtime · تطبيق أندرويد APK · اختيار جهة اتصال من الهاتف · إخفاء بيانات الكروت مع زر إظهار.

---

## 14) قواعد العمل (Business Rules)
1. اسم المستخدم مشتق دائماً من رقم الهاتف: `u<digits>`، والبريد الداخلي `u<digits>@wificards.local`. تغيير الهاتف يغيّر الاسم والبريد ويحدّث اللقطات التاريخية في `sales/card_requests/join_requests`.
2. المندوب الجديد غير نشط حتى موافقة مدير الشبكة.
3. الكرت يمر بـ `AVAILABLE → ASSIGNED → SOLD` فقط، ورقم الكرت لا يُعرض في الكبينة قبل إتمام البيع.
4. طلب `CREDIT` يزيد دين المندوب بقيمة `total_value`؛ الدفعات تُنقص `paid_amount`. الرصيد = الدين − المسدد.
5. المبيعات الخارجية (`is_external = true`) تُستثنى من إحصاءات لوحة التحكم.
6. حذف عملية بيع يتيح خيارين: إرجاع الكرت لحساب المندوب أو الحذف دون إرجاع.
7. لا يمكن حذف كرت مباع إلا بـ `_force`، وتُعاد النتيجة كـ `(deleted, skipped_sold)`.
8. رقم العملية `transaction_no` فريد ويُولَّد داخل `sell_card`.
9. كل المبالغ تُعرض برمز الريال ﷼، والتواريخ باليوم/الشهر/السنة بالعربية.
10. `superadmin` لا يرى أي واجهة غير صفحة الإدارة العامة.

---

## 15) قواعد التصميم
- RTL كامل على مستوى `<html dir="rtl">` وكل الصفحات/الجداول/القوائم/الكروت.
- خط **Cairo** (`--font-sans`) بأوزان 400–800.
- لون أساسي Teal `#009688` = `oklch(0.58 0.11 190)`، توهّج `#14B8A6`، خلفية `#F8FAFC`، نص `#0F172A`، نجاح `#22C55E`، تحذير `#F59E0B`، خطر `#EF4444`.
- كل الألوان **رموز تصميم دلالية** في `src/styles.css` عبر `@theme inline` + متغيرات `:root` و`.dark` — ممنوع `text-white`/`bg-[#...]`.
- `--radius: 0.75rem` مع مقاسات sm→3xl، وظلال `--shadow-soft/elegant/glow`، وتدرّجات `--gradient-primary/surface`.
- Mobile‑First: الجداول تتحول إلى `MobileDataCard`، شبكات `grid-cols-1 → md:2 → lg:3/4`، شريط سفلي بأربعة عناصر، احترام `env(safe-area-inset-*)` عبر `--app-safe-top/bottom`.
- التنبيهات (sonner) تختفي خلال ثانيتين.

---

## 16) قواعد الأمان
- RLS مفعّل على كل جدول، وكل السياسات مقيّدة بـ `authenticated` و`auth.uid()` — لا وصول لـ `anon`.
- الأدوار في جدول `user_roles` منفصل، ولا يمكن الكتابة عليه من العميل إطلاقاً؛ الفحص عبر `has_role()` SECURITY DEFINER.
- تريجرات تمنع تصعيد الصلاحيات وتفعيل الذات وتعديل المبيعات من المندوب.
- كل العمليات الحساسة عبر دوال `SECURITY DEFINER` مع `set search_path = public` بدل كتابة مباشرة.
- `SUPABASE_SERVICE_ROLE_KEY` سيرفري فقط، ويُستورد ديناميكياً داخل الـ handlers.
- الجلسة تُمرَّر إلى Server Functions عبر `attachSupabaseAuth` (Bearer)، ويُعاد التحقق منها بـ `requireSupabaseAuth`.
- إخفاء بيانات الكروت افتراضياً (`RevealText`).
- تنظيف مفاتيح التخزين عند تسجيل الخروج + إعادة تحميل صلبة.
- لا تُخزَّن بيانات شخصية/حساسة في كاش localStorage (انظر §17).

---

## 17) قواعد الأداء
- `QueryClient`: `staleTime 30s`, `gcTime 24h`, `refetchOnWindowFocus: false`, `networkMode: "offlineFirst"`.
- إعادة المحاولة بـ Exponential Backoff (queries حتى 3 مرات / mutations حتى مرتين) مع تجاهل أخطاء 4xx عدا 408 و429.
- Persist للكاش في localStorage بمفتاح `app.query-cache.v1`، `maxAge 24h`, `throttle 1.5s`، ويُخزَّن **فقط**: `packages`, `cards-available`, `networks`, `network`.
- فهارس مركّبة على الأعمدة الأكثر استعلاماً (انظر §4.2)، ودوال RPC مجمِّعة (`admin_stats`, `package_counts`, `superadmin_*`) بدل استعلامات N+1.
- Debounce 250ms لإبطال الكاش من Realtime.
- تحميل ديناميكي لمكتبات الثقيلة (pdfmake، pdfjs، persist client).
- إعادة تحميل تلقائية عند فشل تحميل chunk بعد النشر (بحماية من الحلقات: 10 ثوانٍ).

---

## 18) قواعد الـ Offline
- **Service Worker** `public/sw.js` نسخة `karti-v2`:
  - `NetworkFirst` لتنقّلات HTML مع رجوع للكاش، وصفحة "لا يوجد اتصال" عربية عند الفشل التام.
  - `CacheFirst` للأصول المجزّأة (`/_build/`, `/assets/`, js/css/خطوط/صور).
  - تجاهل الطلبات غير GET وغير same‑origin (حركة Supabase تذهب للشبكة).
  - `SHELL_URLS = ['/', '/app', '/auth', '/manifest.webmanifest', '/favicon.ico']`، تنظيف الكاشات القديمة عند التفعيل، `skipWaiting` + `clients.claim`.
- **طابور العمليات المؤجلة** `offline-queue.ts`: `enqueueOrRun` ينفّذ مباشرة عند وجود اتصال أو يخزّن العملية، و`initOfflineQueueAutoSync` يفرّغ الطابور تلقائياً عند عودة الإنترنت، مع `OfflineBanner` يعرض العدد.
- كاش React Query المحفوظ يسمح بفتح التطبيق وعرض الباقات/الكروت المتاحة بدون إنترنت.

---

## 19) قواعد الـ Realtime
قناة Supabase واحدة `global-sync` تشترك في `postgres_changes` (`event: "*"`, `schema: "public"`) لتسعة جداول، وتستدعي `queryClient.invalidateQueries()` مرة واحدة كل 250ms — فيتحدث كل شيء تلقائياً بلا زر تحديث (مع بقاء `RefreshButton` كخيار يدوي).

---

## 20) إعدادات Capacitor (`capacitor.config.ts`)
```ts
appId: "com.mofeed.karti"
appName: "كرتي"
webDir: ".output/public"
server: { url: "https://arabic-layout-project.onrender.com", androidScheme: "https",
          cleartext: false,
          allowNavigation: ["arabic-layout-project.onrender.com","*.onrender.com","*.supabase.co","*.lovable.app"] }
android: { allowMixedContent: false, backgroundColor: "#009688", webContentsDebuggingEnabled: false }
plugins:
  SplashScreen: { launchShowDuration: 2000, launchAutoHide: false, backgroundColor: "#009688",
                  androidSplashResourceName: "splash", androidScaleType: "CENTER_CROP",
                  showSpinner: true, spinnerColor: "#ffffff", splashFullScreen: true, splashImmersive: true }
  StatusBar: { backgroundColor: "#009688", style: "LIGHT", overlaysWebView: true }
  App: { launchUrl: "https://arabic-layout-project.onrender.com" }
```
`src/lib/capacitor-native.ts` → `initCapacitorNative(router)`: ضبط StatusBar/SplashScreen، و**زر الرجوع**: يرجع في التاريخ، وفي الصفحة الرئيسية يخرج من التطبيق بعد ضغطتين.
`scripts/ensure-capacitor-contacts.mjs` يضمن وجود إضافة جهات الاتصال قبل البناء (`bun run prepare:android`).

## 21) إعدادات PWA
`public/manifest.webmanifest`: `name: "كرتي"`, `short_name: "WiFi Cards"`, وصف عربي، `start_url: "/"`, `display: standalone`, `background_color: #F8FAFC`, `theme_color: #009688`, `lang: "ar"`, `dir: "rtl"`, أيقونة `/favicon.ico`. مربوط في `__root.tsx` مع `theme-color` و`viewport-fit=cover`.

## 22) إعدادات Build
- `vite.config.ts`: `defineConfig` من `@lovable.dev/vite-tanstack-config` مع `tanstackStart.server.entry = "server"` (لتوجيه SSR إلى `src/server.ts`) و`nitro.preset = "node-server"` (المخرجات: `.output/server/index.mjs` + `.output/public`). لا تُضاف يدوياً إضافات tanstackStart/react/tailwind/tsconfigPaths — الحزمة تتضمنها.
- سكربتات: `dev`, `build`, `build:dev`, `preview`, `start`, `lint`, `format`, `prepare:android`.
- `build-android.cmd` / `build-android.ps1`: بناء الويب ثم `npx cap sync android` ثم Gradle لإخراج APK.

## 23) إعدادات Deploy (`render.yaml`)
خدمة web على Render (Node، خطة free، منطقة frankfurt)، تثبيت Bun في أمر البناء ثم `bun install --frozen-lockfile && bun run build`، والتشغيل `node .output/server/index.mjs`، مع `NODE_VERSION=20` ومتغيرات `VITE_SUPABASE_*` من لوحة Render. تطبيق أندرويد يشير إلى نفس عنوان Render.

## 24) متغيرات البيئة
| المتغير | المكان |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` | العميل (`import.meta.env`) |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_ID` | السيرفر (`process.env` داخل handlers) |
| `SUPABASE_SERVICE_ROLE_KEY` | السيرفر فقط — يُقرأ داخل handlers لعمليات الإدارة |
| `NODE_VERSION` | Render |

## 25) المكتبات المستخدمة
انظر §2 (القائمة كاملة بالإصدارات كما في `package.json`).

## 26) القرارات المعمارية
1. **TanStack Start فقط** — لا react-router-dom ولا `src/pages`؛ التوجيه بالملفات و`routeTree.gen.ts` مولَّد.
2. **منطق العمل في PostgreSQL** — أكثر من 50 دالة `SECURITY DEFINER` بدل منطق موزّع في العميل؛ يضمن الذرّية والأمان وتقليل الرحلات الشبكية.
3. **Server Functions** بدل Edge Functions لأي منطق داخلي، مع استيراد ديناميكي لعميل الخدمة.
4. **العزل متعدد المستأجرين** عبر `admin_network(auth.uid())` في كل سياسة RLS.
5. **الأدوار في جدول منفصل** لمنع تصعيد الصلاحيات.
6. **الهوية من رقم الهاتف** ببريد داخلي صناعي `@wificards.local`، مع مزامنة اللقطات التاريخية.
7. **لقطات نصية للأسماء** (`agent_username`, `package_name`, `network_name`) في `sales`/`card_requests` للحفاظ على التقارير التاريخية، مع حل العرض عبر `useUserNames.byId`.
8. **Offline‑first**: SW + كاش مُخزَّن انتقائياً + طابور عمليات.
9. **Realtime مركزي واحد** بدل اشتراكات متفرقة لكل صفحة.
10. **PDF بـ pdfmake + arabic-persian-reshaper** لضمان تشكيل الحروف العربية واتجاه RTL الصحيح، مع مشاركة/حفظ عبر Capacitor على أندرويد.
11. **غلاف أخطاء SSR** (`src/server.ts`) يحوّل أخطاء h3 المبتلعة إلى صفحة خطأ عربية مقروءة.
12. **تصميم رمزي بالكامل** في Tailwind v4 بدون ملف إعداد، لدعم الوضع الليلي وتوحيد الهوية.
