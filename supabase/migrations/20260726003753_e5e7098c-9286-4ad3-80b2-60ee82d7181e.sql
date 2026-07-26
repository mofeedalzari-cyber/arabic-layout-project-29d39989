
DO $$
DECLARE
  v_super uuid := 'de380cef-b6f1-4070-80d4-096d1b1f4c76';
  v_net uuid := '4664887b-9955-40c1-be8d-d2a934d2c942';
  v_temp_net_name text := '__tmp_net_'||substr(gen_random_uuid()::text,1,8);
  v_new uuid := gen_random_uuid();
  v_new_email text := 'u778492884@wificards.local';
  v_super_email text := 'u772622028@wificards.local';
  v_created_net uuid;
BEGIN
  -- 1) Rename superadmin to free up u778492884
  UPDATE public.profiles SET username = 'u772622028' WHERE id = v_super;
  UPDATE auth.users SET email = v_super_email,
    raw_user_meta_data = COALESCE(raw_user_meta_data,'{}'::jsonb) || jsonb_build_object('username','u772622028','phone','772622028')
    WHERE id = v_super;
  UPDATE auth.identities SET identity_data = jsonb_set(identity_data, '{email}', to_jsonb(v_super_email))
    WHERE user_id = v_super AND provider = 'email';

  -- 2) Create new auth user via account_type=network with a temporary network name
  --    so the handle_new_user trigger accepts it.
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, phone, phone_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change,
    email_change_token_new, recovery_token
  ) VALUES (
    v_new, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    v_new_email, crypt('Mofe@2025#', gen_salt('bf')),
    now(), '778492884', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'username','u778492884',
      'full_name','مفيد صالح علي محمد الزري',
      'phone','778492884',
      'account_type','network',
      'network_name', v_temp_net_name
    ),
    now(), now(), '', '', '', ''
  );

  INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), v_new, v_new::text,
          jsonb_build_object('sub', v_new::text, 'email', v_new_email),
          'email', now(), now(), now());

  -- Ensure profile shows the correct display name & phone (trigger already inserted it)
  UPDATE public.profiles
     SET full_name = 'مفيد صالح علي محمد الزري',
         phone = '778492884',
         is_active = true
   WHERE id = v_new;

  -- 3) Delete the temp network the trigger just created and detach the new user
  SELECT id INTO v_created_net FROM public.networks WHERE owner_id = v_new;
  UPDATE public.profiles SET network_id = NULL WHERE id = v_new;
  IF v_created_net IS NOT NULL THEN
    DELETE FROM public.networks WHERE id = v_created_net;
  END IF;

  -- 4) Point the new admin at the real network and transfer ownership
  UPDATE public.profiles SET network_id = v_net WHERE id = v_new;
  UPDATE public.networks SET owner_id = v_new, created_by = v_new WHERE id = v_net;

  -- 5) Reassign records that reference the superadmin inside this network
  UPDATE public.cards SET assigned_to = v_new WHERE assigned_to = v_super AND network_id = v_net;
  UPDATE public.cards SET sold_to = v_new WHERE sold_to = v_super AND network_id = v_net;
  UPDATE public.sales SET agent_id = v_new, agent_username = 'u778492884' WHERE agent_id = v_super AND network_id = v_net;
  UPDATE public.card_requests SET agent_id = v_new, agent_username = 'u778492884' WHERE agent_id = v_super AND network_id = v_net;

  -- 6) Detach superadmin from the network and drop its admin role
  UPDATE public.profiles SET network_id = NULL WHERE id = v_super;
  DELETE FROM public.user_roles WHERE user_id = v_super AND role = 'admin';
END $$;
