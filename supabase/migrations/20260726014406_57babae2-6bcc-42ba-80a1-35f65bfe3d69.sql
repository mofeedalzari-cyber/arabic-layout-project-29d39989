
DO $$
DECLARE
  r RECORD;
  v_name TEXT;
  v_suffix INT;
  v_new_id UUID;
BEGIN
  FOR r IN
    SELECT p.id AS owner_id,
           NULLIF(trim(u.raw_user_meta_data->>'network_name'),'') AS net_name
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'admin'::public.app_role
    WHERE p.network_id IS NULL
      AND NOT public.is_superadmin(p.id)
      AND lower(COALESCE(u.raw_user_meta_data->>'account_type','')) = 'network'
      AND NULLIF(trim(u.raw_user_meta_data->>'network_name'),'') IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.networks n WHERE n.owner_id = p.id)
  LOOP
    v_name := r.net_name;
    v_suffix := 2;
    WHILE EXISTS (SELECT 1 FROM public.networks WHERE lower(name) = lower(v_name)) LOOP
      v_name := r.net_name || ' (' || v_suffix || ')';
      v_suffix := v_suffix + 1;
    END LOOP;
    INSERT INTO public.networks (name, owner_id, created_by, is_active)
    VALUES (v_name, r.owner_id, r.owner_id, true)
    RETURNING id INTO v_new_id;
    UPDATE public.profiles SET network_id = v_new_id, is_active = true WHERE id = r.owner_id;
  END LOOP;
END $$;
