-- ============================================================
-- إصلاح حسابات المصادقة المفقودة بعد نقل قاعدة البيانات
-- الصق هذا الملف كامل في SQL Editor للمشروع الجديد ونفّذه مرة واحدة.
--
-- ما يفعله:
--  1) ينشئ صفًّا في auth.users + auth.identities لكل صف في profiles لا يملك حساب مصادقة.
--  2) البريد = <username>@wificards.local  (نفس ما يستخدمه التطبيق عند الدخول برقم الهاتف)
--  3) كلمة سر مؤقتة موحّدة لكل الحسابات: Mofeed@2026
--     ما عدا حساب مدير التطبيق 772622028 فكلمة سره: MOFEEDZARY7890#
--  4) يوحّد أي بريد قديم بنطاق @karati.local إلى @wificards.local
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1) توحيد النطاق القديم
UPDATE auth.users
SET email = replace(email, '@karati.local', '@wificards.local')
WHERE email LIKE '%@karati.local';

UPDATE auth.identities
SET identity_data = jsonb_set(
      identity_data, '{email}',
      to_jsonb(replace(identity_data->>'email', '@karati.local', '@wificards.local'))
    )
WHERE identity_data->>'email' LIKE '%@karati.local';

-- 2) إنشاء حسابات المصادقة المفقودة
DO $$
DECLARE
  r record;
  v_email text;
  v_pwd   text;
BEGIN
  FOR r IN
    SELECT p.id, p.username, p.full_name, p.phone
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE u.id IS NULL
  LOOP
    v_email := lower(r.username) || '@wificards.local';

    IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_email) THEN
      CONTINUE; -- البريد مستخدم مسبقًا، تخطَّ
    END IF;

    v_pwd := CASE WHEN r.phone = '772622028' OR r.username = 'u772622028'
                  THEN 'MOFEEDZARY7890#'
                  ELSE 'Mofeed@2026' END;

    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', r.id, 'authenticated', 'authenticated',
      v_email, extensions.crypt(v_pwd, extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('username', r.username, 'full_name', r.full_name,
                         'phone', r.phone, 'skip_bootstrap', true),
      now(), now()
    );

    INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
    VALUES (gen_random_uuid(), r.id, r.id::text, 'email',
            jsonb_build_object('sub', r.id::text, 'email', v_email, 'email_verified', true),
            now(), now())
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- 3) تحقّق نهائي: يجب أن تكون النتيجة 0
SELECT count(*) AS "حسابات_مصادقة_مفقودة"
FROM public.profiles p
LEFT JOIN auth.users u ON u.id = p.id
WHERE u.id IS NULL;
