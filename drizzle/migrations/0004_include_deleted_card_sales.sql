DO $$
DECLARE f text; n text;
BEGIN
  FOREACH n IN ARRAY ARRAY['admin_stats','dashboard_breakdown'] LOOP
    SELECT pg_get_functiondef(oid) INTO f FROM pg_proc WHERE proname = n AND pronamespace = 'public'::regnamespace;
    f := replace(f, 'is_external = false AND card_id IS NOT NULL', 'is_external = false AND (card_id IS NOT NULL OR card_number IS NOT NULL)');
    EXECUTE f;
  END LOOP;
END $$;