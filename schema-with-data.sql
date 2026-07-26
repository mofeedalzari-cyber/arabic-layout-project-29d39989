--
-- PostgreSQL database dump
--

\restrict Sqf53jJ9Q4s1iWSkEysuW883HAn1ZSNuZWpnf5fiTxjxSL2x6TYbnmkQIbibSOC

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'SQL_ASCII';
SET standard_conforming_strings = off;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET escape_string_warning = off;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA "public";


--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."app_role" AS ENUM (
    'admin',
    'agent',
    'superadmin'
);


--
-- Name: card_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."card_status" AS ENUM (
    'AVAILABLE',
    'ASSIGNED',
    'SOLD'
);


--
-- Name: admin_delete_cards("uuid"[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."admin_delete_cards"("_ids" "uuid"[]) RETURNS TABLE("deleted" integer, "skipped_sold" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_uid UUID := auth.uid(); v_net UUID := public.admin_network(v_uid); v_del INT; v_sold INT;
BEGIN
  IF v_net IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _ids IS NULL OR array_length(_ids,1) IS NULL THEN RETURN QUERY SELECT 0,0; RETURN; END IF;
  SELECT count(*)::int INTO v_sold FROM public.cards
    WHERE id = ANY(_ids) AND status='SOLD' AND network_id = v_net;
  WITH d AS (
    DELETE FROM public.cards
      WHERE id = ANY(_ids) AND status<>'SOLD' AND network_id = v_net
      RETURNING id
  ) SELECT count(*)::int INTO v_del FROM d;
  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (v_uid, 'BULK_DELETE_CARDS', 'cards', NULL,
          jsonb_build_object('deleted', v_del, 'skipped_sold', v_sold, 'network_id', v_net));
  RETURN QUERY SELECT v_del, v_sold;
END; $$;


--
-- Name: admin_delete_cards("uuid"[], boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."admin_delete_cards"("_ids" "uuid"[], "_force" boolean DEFAULT false) RETURNS TABLE("deleted" integer, "skipped_sold" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_net uuid := public.admin_network(v_uid);
  v_del int := 0;
  v_sold int := 0;
BEGIN
  IF v_net IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  IF _force THEN
    -- Delete sales first so agent account/debt totals are recalculated immediately,
    -- even if a previous/legacy FK did not cascade as expected.
    DELETE FROM public.sales s
    USING public.cards c
    WHERE s.card_id = c.id
      AND c.id = ANY(_ids)
      AND c.network_id = v_net;

    WITH d AS (
      DELETE FROM public.cards
      WHERE id = ANY(_ids)
        AND network_id = v_net
      RETURNING id
    )
    SELECT count(*)::int INTO v_del FROM d;

    v_sold := 0;
  ELSE
    SELECT count(*)::int INTO v_sold
    FROM public.cards
    WHERE id = ANY(_ids)
      AND status = 'SOLD'
      AND network_id = v_net;

    WITH d AS (
      DELETE FROM public.cards
      WHERE id = ANY(_ids)
        AND status <> 'SOLD'
        AND network_id = v_net
      RETURNING id
    )
    SELECT count(*)::int INTO v_del FROM d;
  END IF;

  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (
    v_uid,
    'BULK_DELETE_CARDS',
    'cards',
    NULL,
    jsonb_build_object('deleted', v_del, 'skipped_sold', v_sold, 'network_id', v_net, 'force', _force)
  );

  RETURN QUERY SELECT v_del, v_sold;
END;
$$;


--
-- Name: admin_delete_network("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."admin_delete_network"("_network_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.networks WHERE id=_network_id AND owner_id=v_uid) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  DELETE FROM public.networks WHERE id = _network_id;
  INSERT INTO public.logs (user_id, action, entity, entity_id)
  VALUES (v_uid, 'DELETE_NETWORK', 'network', _network_id);
END; $$;


--
-- Name: admin_delete_package("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."admin_delete_package"("_package_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_uid UUID := auth.uid(); v_net UUID := public.admin_network(v_uid);
BEGIN
  IF v_net IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.packages WHERE id=_package_id AND network_id=v_net) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  DELETE FROM public.packages WHERE id = _package_id;
  INSERT INTO public.logs (user_id, action, entity, entity_id)
  VALUES (v_uid, 'DELETE_PACKAGE', 'package', _package_id);
END; $$;


--
-- Name: admin_list_cards("uuid", "uuid", "uuid", "text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."admin_list_cards"("_network_id" "uuid", "_package_id" "uuid" DEFAULT NULL::"uuid", "_agent_id" "uuid" DEFAULT NULL::"uuid", "_search" "text" DEFAULT NULL::"text", "_limit" integer DEFAULT 500) RETURNS TABLE("id" "uuid", "username" "text", "password" "text", "status" "text", "package_id" "uuid", "package_name" "text", "assigned_to" "uuid", "assigned_username" "text", "sold_to" "uuid", "sold_username" "text", "created_at" timestamp with time zone, "assigned_at" timestamp with time zone, "sold_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_net UUID := public.admin_network(auth.uid()); v_q TEXT;
BEGIN
  IF v_net IS NULL OR _network_id <> v_net THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  v_q := NULLIF(trim(COALESCE(_search,'')),'');
  RETURN QUERY
    SELECT c.id, c.username, c.password, c.status::text,
           c.package_id, p.name, c.assigned_to, pa.username,
           c.sold_to, ps.username, c.created_at, c.assigned_at, c.sold_at
    FROM public.cards c
    JOIN public.packages p ON p.id = c.package_id
    LEFT JOIN public.profiles pa ON pa.id = c.assigned_to
    LEFT JOIN public.profiles ps ON ps.id = c.sold_to
    WHERE c.network_id = v_net
      AND (_package_id IS NULL OR c.package_id = _package_id)
      AND (_agent_id  IS NULL OR c.assigned_to = _agent_id OR c.sold_to = _agent_id)
      AND (v_q IS NULL OR c.username ILIKE '%'||v_q||'%' OR COALESCE(c.password,'') ILIKE '%'||v_q||'%')
    ORDER BY c.created_at DESC
    LIMIT GREATEST(1, LEAST(_limit, 2000));
END; $$;


--
-- Name: admin_network("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."admin_network"("_uid" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT id FROM public.networks WHERE owner_id = _uid LIMIT 1;
$$;


--
-- Name: admin_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."admin_stats"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v JSONB; v_net UUID := public.admin_network(auth.uid());
BEGIN
  IF v_net IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT jsonb_build_object(
    'total_cards',     (SELECT count(*) FROM cards WHERE network_id = v_net),
    'available',       (SELECT count(*) FROM cards WHERE network_id = v_net AND status='AVAILABLE'),
    'sold',            (SELECT count(*) FROM cards WHERE network_id = v_net AND status='SOLD'),
    'sold_value',      (SELECT COALESCE(sum(price),0) FROM sales WHERE network_id = v_net),
    'available_value', (SELECT COALESCE(sum(p.price),0) FROM cards c JOIN packages p ON p.id=c.package_id
                        WHERE c.network_id = v_net AND c.status='AVAILABLE'),
    'networks',        1,
    'packages',        (SELECT count(*) FROM packages WHERE network_id = v_net),
    'agents',          (SELECT count(*) FROM profiles pr JOIN user_roles ur ON ur.user_id = pr.id
                        WHERE pr.network_id = v_net AND ur.role='agent')
  ) INTO v;
  RETURN v;
END; $$;


--
-- Name: admin_unassign_cards("uuid"[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."admin_unassign_cards"("_ids" "uuid"[]) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_net uuid := public.admin_network(v_uid);
  v_count int := 0;
  v_row RECORD;
  v_req RECORD;
  v_remaining numeric;
  v_reduce numeric;
BEGIN
  IF v_net IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN RETURN 0; END IF;

  -- Snapshot before update (agent + package per card) for debt adjustment
  CREATE TEMP TABLE _unassigned_snap ON COMMIT DROP AS
  SELECT id, assigned_to AS agent_id, package_id
  FROM public.cards
  WHERE id = ANY(_ids) AND network_id = v_net AND status = 'ASSIGNED';

  WITH u AS (
    UPDATE public.cards
    SET status = 'AVAILABLE', assigned_to = NULL, assigned_at = NULL
    WHERE id = ANY(_ids) AND network_id = v_net AND status = 'ASSIGNED'
    RETURNING id
  )
  SELECT count(*)::int INTO v_count FROM u;

  -- Reduce agent debt on approved requests for each unassigned card
  FOR v_row IN SELECT agent_id, package_id FROM _unassigned_snap LOOP
    FOR v_req IN
      SELECT id, total_value, paid_amount, unit_price, approved_quantity
      FROM public.card_requests
      WHERE network_id = v_net
        AND agent_id = v_row.agent_id
        AND package_id = v_row.package_id
        AND status = 'APPROVED'
        AND COALESCE(total_value,0) - COALESCE(paid_amount,0) > 0
      ORDER BY decided_at ASC NULLS LAST, created_at ASC
      FOR UPDATE
    LOOP
      v_remaining := COALESCE(v_req.total_value,0) - COALESCE(v_req.paid_amount,0);
      v_reduce := LEAST(COALESCE(v_req.unit_price,0), v_remaining);
      IF v_reduce <= 0 THEN CONTINUE; END IF;
      UPDATE public.card_requests
      SET total_value = COALESCE(total_value,0) - v_reduce,
          approved_quantity = GREATEST(COALESCE(approved_quantity,0) - 1, 0)
      WHERE id = v_req.id;
      EXIT; -- one card handled
    END LOOP;
  END LOOP;

  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (v_uid, 'UNASSIGN_CARDS', 'cards', NULL,
          jsonb_build_object('unassigned', v_count, 'network_id', v_net));

  RETURN v_count;
END;
$$;


--
-- Name: admin_wipe_database(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."admin_wipe_database"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_net uuid := public.admin_network(v_uid);
  v_deleted jsonb := '{}'::jsonb;
  v_c int;
  v_agent_ids uuid[];
BEGIN
  IF v_net IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_agent_ids
  FROM public.profiles WHERE network_id = v_net AND id <> v_uid;

  WITH d AS (DELETE FROM public.request_payments rp
    USING public.card_requests cr
    WHERE rp.request_id = cr.id AND cr.network_id = v_net RETURNING rp.id)
    SELECT count(*) INTO v_c FROM d;
  v_deleted := v_deleted || jsonb_build_object('request_payments', v_c);

  DELETE FROM public.sales WHERE network_id = v_net;
  GET DIAGNOSTICS v_c = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('sales', v_c);

  DELETE FROM public.card_requests WHERE network_id = v_net;
  GET DIAGNOSTICS v_c = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('card_requests', v_c);

  DELETE FROM public.cards WHERE network_id = v_net;
  GET DIAGNOSTICS v_c = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('cards', v_c);

  DELETE FROM public.packages WHERE network_id = v_net;
  GET DIAGNOSTICS v_c = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('packages', v_c);

  DELETE FROM public.join_requests WHERE network_id = v_net;
  GET DIAGNOSTICS v_c = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('join_requests', v_c);

  DELETE FROM public.logs WHERE user_id = ANY(v_agent_ids);
  GET DIAGNOSTICS v_c = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('logs', v_c);

  -- Detach agents from the network so we can delete the network row
  UPDATE public.profiles SET network_id = NULL WHERE id = ANY(v_agent_ids);

  DELETE FROM public.user_roles WHERE user_id = ANY(v_agent_ids);
  DELETE FROM public.profiles WHERE id = ANY(v_agent_ids);
  GET DIAGNOSTICS v_c = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('agents_deleted', v_c);

  DELETE FROM auth.users WHERE id = ANY(v_agent_ids);

  -- Detach admin from network then delete the network itself
  UPDATE public.profiles SET network_id = NULL WHERE id = v_uid;
  DELETE FROM public.networks WHERE id = v_net;
  GET DIAGNOSTICS v_c = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('network_deleted', v_c);

  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (v_uid, 'WIPE_NETWORK', 'network', v_net, v_deleted);

  RETURN v_deleted;
END; $$;


--
-- Name: agent_cabin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."agent_cabin"() RETURNS TABLE("package_id" "uuid", "package_name" "text", "network_id" "uuid", "network_name" "text", "price" numeric, "color" "text", "data_size" "text", "speed" "text", "validity" "text", "currency" "text", "available" integer, "sold_count" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  RETURN QUERY
    WITH mine AS (
      SELECT c.package_id,
             count(*) FILTER (WHERE c.status = 'ASSIGNED') AS avail,
             count(*) FILTER (WHERE c.status = 'SOLD') AS sold
      FROM public.cards c
      WHERE (c.assigned_to = v_uid AND c.status = 'ASSIGNED')
         OR (c.sold_to = v_uid AND c.status = 'SOLD')
      GROUP BY c.package_id
    )
    SELECT p.id, p.name, n.id, n.name, p.price, p.color, p.data_size, p.speed, p.validity,
           n.currency, COALESCE(m.avail,0)::int, COALESCE(m.sold,0)::int
    FROM mine m
    JOIN public.packages p ON p.id = m.package_id
    JOIN public.networks n ON n.id = p.network_id
    ORDER BY n.name, p.sort_order, p.name;
END; $$;


--
-- Name: approve_card_request("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."approve_card_request"("_request_id" "uuid") RETURNS TABLE("approved" integer, "remaining" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_uid UUID := auth.uid(); v_net UUID := public.admin_network(v_uid);
  v_req RECORD; v_moved INT;
BEGIN
  IF v_net IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO v_req FROM public.card_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
  IF v_req.network_id <> v_net THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_req.status <> 'PENDING' THEN RAISE EXCEPTION 'ALREADY_DECIDED'; END IF;
  WITH picked AS (
    SELECT id FROM public.cards
      WHERE package_id = v_req.package_id AND network_id = v_net AND status='AVAILABLE'
      ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT v_req.quantity
  ), upd AS (
    UPDATE public.cards c SET status='ASSIGNED', assigned_to=v_req.agent_id, assigned_at=now()
      FROM picked WHERE c.id = picked.id RETURNING c.id
  ) SELECT count(*)::int INTO v_moved FROM upd;
  UPDATE public.card_requests
    SET status='APPROVED', approved_quantity=v_moved, decided_by=v_uid, decided_at=now(),
        total_value = COALESCE(unit_price,0) * v_moved
    WHERE id = _request_id;
  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (v_uid, 'APPROVE_REQUEST', 'card_request', _request_id,
          jsonb_build_object('requested', v_req.quantity, 'approved', v_moved,
                             'agent', v_req.agent_username, 'package', v_req.package_name));
  RETURN QUERY SELECT v_moved, GREATEST(v_req.quantity - v_moved, 0);
END; $$;


--
-- Name: approve_join_request("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."approve_join_request"("_request_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_uid UUID := auth.uid(); v_req RECORD; v_net UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  v_net := public.admin_network(v_uid);
  IF v_net IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO v_req FROM public.join_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
  IF v_req.network_id <> v_net THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_req.status <> 'PENDING' THEN RAISE EXCEPTION 'ALREADY_DECIDED'; END IF;
  UPDATE public.profiles SET network_id = v_req.network_id, is_active = true WHERE id = v_req.agent_id;
  UPDATE public.join_requests SET status='APPROVED', decided_at=now(), decided_by=v_uid WHERE id = _request_id;
  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (v_uid, 'APPROVE_JOIN', 'join_request', _request_id,
          jsonb_build_object('agent', v_req.agent_username, 'network_id', v_req.network_id));
END; $$;


--
-- Name: bulk_upload_cards("uuid", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."bulk_upload_cards"("_package_id" "uuid", "_entries" "jsonb") RETURNS TABLE("inserted" integer, "duplicates" integer, "errors" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_uid UUID := auth.uid(); v_net UUID := public.admin_network(v_uid);
  v_pkg RECORD; v_entry JSONB; v_u TEXT; v_p TEXT;
  v_inserted INT := 0; v_dup INT := 0; v_err INT := 0;
BEGIN
  IF v_net IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO v_pkg FROM public.packages WHERE id = _package_id AND network_id = v_net;
  IF NOT FOUND THEN RAISE EXCEPTION 'PACKAGE_NOT_FOUND'; END IF;
  FOR v_entry IN SELECT * FROM jsonb_array_elements(_entries) LOOP
    v_u := trim(v_entry->>'username');
    v_p := NULLIF(trim(COALESCE(v_entry->>'password','')),'');
    IF v_u IS NULL OR v_u = '' THEN v_err := v_err + 1; CONTINUE; END IF;
    BEGIN
      INSERT INTO public.cards (package_id, network_id, username, password)
      VALUES (_package_id, v_pkg.network_id, v_u, v_p);
      v_inserted := v_inserted + 1;
    EXCEPTION WHEN unique_violation THEN v_dup := v_dup + 1;
      WHEN OTHERS THEN v_err := v_err + 1;
    END;
  END LOOP;
  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (v_uid, 'UPLOAD_CARDS', 'package', _package_id,
          jsonb_build_object('inserted', v_inserted, 'duplicates', v_dup, 'errors', v_err));
  RETURN QUERY SELECT v_inserted, v_dup, v_err;
END; $$;


--
-- Name: create_my_network("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."create_my_network"("_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_uid UUID := auth.uid(); v_name TEXT := NULLIF(trim(_name),''); v_id UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF v_name IS NULL THEN RAISE EXCEPTION 'NETWORK_NAME_REQUIRED'; END IF;
  IF public.admin_network(v_uid) IS NOT NULL THEN RAISE EXCEPTION 'ALREADY_HAS_NETWORK'; END IF;
  IF EXISTS (SELECT 1 FROM public.networks WHERE lower(name)=lower(v_name)) THEN
    RAISE EXCEPTION 'NETWORK_NAME_TAKEN';
  END IF;
  INSERT INTO public.networks (name, owner_id, created_by, is_active)
  VALUES (v_name, v_uid, v_uid, true) RETURNING id INTO v_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
  UPDATE public.profiles SET network_id = v_id, is_active = true WHERE id = v_uid;
  RETURN v_id;
END; $$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_username TEXT;
  v_full_name TEXT;
  v_phone TEXT;
  v_account_type TEXT;
  v_network_name TEXT;
  v_network_id UUID;
BEGIN
  v_username := COALESCE(NULLIF(NEW.raw_user_meta_data->>'username',''), split_part(NEW.email,'@',1));
  v_full_name := NULLIF(NEW.raw_user_meta_data->>'full_name','');
  v_phone := NULLIF(NEW.raw_user_meta_data->>'phone','');
  v_account_type := lower(COALESCE(NULLIF(NEW.raw_user_meta_data->>'account_type',''),'agent'));
  v_network_name := NULLIF(trim(NEW.raw_user_meta_data->>'network_name'),'');

  INSERT INTO public.profiles (id, username, full_name, phone, is_active, network_id)
  VALUES (NEW.id, v_username, v_full_name, v_phone, false, NULL)
  ON CONFLICT (id) DO UPDATE SET
    username  = EXCLUDED.username,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    phone     = COALESCE(EXCLUDED.phone, public.profiles.phone),
    updated_at = now();

  IF v_account_type = 'network' THEN
    IF v_network_name IS NULL THEN RAISE EXCEPTION 'NETWORK_NAME_REQUIRED'; END IF;
    IF EXISTS (SELECT 1 FROM public.networks WHERE lower(name) = lower(v_network_name)) THEN
      RAISE EXCEPTION 'NETWORK_NAME_TAKEN';
    END IF;
    INSERT INTO public.networks (name, owner_id, created_by, is_active)
    VALUES (v_network_name, NEW.id, NEW.id, true)
    RETURNING id INTO v_network_id;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
    UPDATE public.profiles SET network_id = v_network_id, is_active = true WHERE id = NEW.id;
  ELSE
    IF v_network_name IS NULL THEN RAISE EXCEPTION 'NETWORK_NAME_REQUIRED'; END IF;
    SELECT id INTO v_network_id FROM public.networks WHERE lower(name) = lower(v_network_name) LIMIT 1;
    IF v_network_id IS NULL THEN RAISE EXCEPTION 'NETWORK_NOT_FOUND'; END IF;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'agent')
    ON CONFLICT (user_id, role) DO NOTHING;
    INSERT INTO public.join_requests (network_id, agent_id, agent_username, agent_full_name, agent_phone)
    VALUES (v_network_id, NEW.id, v_username, v_full_name, v_phone);
  END IF;
  RETURN NEW;
END; $$;


--
-- Name: has_role("uuid", "public"."app_role"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;


--
-- Name: is_active_user("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."is_active_user"("_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE((SELECT is_active FROM public.profiles WHERE id = _user_id), false);
$$;


--
-- Name: is_superadmin("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."is_superadmin"("_uid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role = 'superadmin'::public.app_role);
$$;


--
-- Name: list_active_networks(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."list_active_networks"() RETURNS TABLE("id" "uuid", "name" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT id, name FROM public.networks WHERE is_active = true ORDER BY name;
$$;


--
-- Name: package_counts("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."package_counts"("_network_id" "uuid") RETURNS TABLE("package_id" "uuid", "available" integer, "assigned" integer, "sold" integer, "my_assigned" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  RETURN QUERY
    SELECT p.id,
      COALESCE(SUM(CASE WHEN c.status='AVAILABLE' THEN 1 ELSE 0 END),0)::int,
      COALESCE(SUM(CASE WHEN c.status='ASSIGNED' THEN 1 ELSE 0 END),0)::int,
      COALESCE(SUM(CASE WHEN c.status='SOLD' THEN 1 ELSE 0 END),0)::int,
      COALESCE(SUM(CASE WHEN c.status='ASSIGNED' AND c.assigned_to=v_uid THEN 1 ELSE 0 END),0)::int
    FROM public.packages p
    LEFT JOIN public.cards c ON c.package_id = p.id
    WHERE p.network_id = _network_id
    GROUP BY p.id;
END; $$;


--
-- Name: prevent_non_admin_activation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."prevent_non_admin_activation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Allow system context (no auth uid, e.g. signup trigger) to change activation
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.is_active IS DISTINCT FROM OLD.is_active
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'FORBIDDEN: only network owners can change is_active';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: prevent_profile_privilege_escalation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."prevent_profile_privilege_escalation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.id = auth.uid()
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      RAISE EXCEPTION 'FORBIDDEN: cannot change is_active on own profile';
    END IF;
    IF NEW.network_id IS DISTINCT FROM OLD.network_id THEN
      RAISE EXCEPTION 'FORBIDDEN: cannot change network_id on own profile';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: record_request_payment("uuid", numeric, "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."record_request_payment"("_request_id" "uuid", "_amount" numeric, "_note" "text" DEFAULT NULL::"text") RETURNS TABLE("paid_amount" numeric, "remaining" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_uid UUID := auth.uid(); v_net UUID := public.admin_network(v_uid);
  v_req RECORD; v_username TEXT; v_new_paid NUMERIC;
BEGIN
  IF v_net IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
  SELECT * INTO v_req FROM public.card_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
  IF v_req.network_id <> v_net THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_req.status <> 'APPROVED' THEN RAISE EXCEPTION 'NOT_APPROVED'; END IF;
  v_new_paid := COALESCE(v_req.paid_amount,0) + _amount;
  IF v_new_paid > COALESCE(v_req.total_value,0) + 0.001 THEN RAISE EXCEPTION 'EXCEEDS_TOTAL'; END IF;
  SELECT username INTO v_username FROM public.profiles WHERE id = v_uid;
  INSERT INTO public.request_payments (request_id, amount, note, recorded_by, recorded_by_username)
  VALUES (_request_id, _amount, NULLIF(trim(_note),''), v_uid, v_username);
  UPDATE public.card_requests SET paid_amount = v_new_paid WHERE id = _request_id;
  INSERT INTO public.logs (user_id, actor_username, action, entity, entity_id, metadata)
  VALUES (v_uid, v_username, 'RECORD_PAYMENT', 'card_request', _request_id,
          jsonb_build_object('amount', _amount, 'agent', v_req.agent_username));
  RETURN QUERY SELECT v_new_paid, GREATEST(COALESCE(v_req.total_value,0) - v_new_paid, 0);
END; $$;


--
-- Name: reject_card_request("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."reject_card_request"("_request_id" "uuid", "_reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_uid UUID := auth.uid(); v_net UUID := public.admin_network(v_uid); v_req RECORD;
BEGIN
  IF v_net IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO v_req FROM public.card_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
  IF v_req.network_id <> v_net THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_req.status <> 'PENDING' THEN RAISE EXCEPTION 'ALREADY_DECIDED'; END IF;
  UPDATE public.card_requests
    SET status='REJECTED', reject_reason=NULLIF(trim(_reason),''),
        decided_by=v_uid, decided_at=now()
    WHERE id = _request_id;
  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (v_uid, 'REJECT_REQUEST', 'card_request', _request_id,
          jsonb_build_object('agent', v_req.agent_username, 'package', v_req.package_name, 'reason', _reason));
END; $$;


--
-- Name: reject_join_request("uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."reject_join_request"("_request_id" "uuid", "_reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_uid UUID := auth.uid(); v_req RECORD; v_net UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  v_net := public.admin_network(v_uid);
  IF v_net IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO v_req FROM public.join_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
  IF v_req.network_id <> v_net THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_req.status <> 'PENDING' THEN RAISE EXCEPTION 'ALREADY_DECIDED'; END IF;
  UPDATE public.join_requests SET status='REJECTED', reject_reason=NULLIF(trim(_reason),''),
    decided_at=now(), decided_by=v_uid WHERE id = _request_id;
  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (v_uid, 'REJECT_JOIN', 'join_request', _request_id,
          jsonb_build_object('agent', v_req.agent_username, 'reason', _reason));
END; $$;


--
-- Name: request_cards("uuid", integer, "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."request_cards"("_package_id" "uuid", "_quantity" integer, "_notes" "text" DEFAULT NULL::"text", "_payment_method" "text" DEFAULT 'CREDIT'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_uid uuid := auth.uid(); v_username text; v_pkg record; v_net record; v_id uuid; v_pm text; v_agent_net uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.is_active_user(v_uid) THEN RAISE EXCEPTION 'ACCOUNT_INACTIVE'; END IF;
  IF NOT public.has_role(v_uid,'agent') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _quantity IS NULL OR _quantity <= 0 OR _quantity > 10000 THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;
  v_pm := UPPER(COALESCE(_payment_method,'CREDIT'));
  IF v_pm NOT IN ('CASH','CREDIT') THEN v_pm := 'CREDIT'; END IF;
  SELECT username, network_id INTO v_username, v_agent_net FROM public.profiles WHERE id = v_uid;
  IF v_agent_net IS NULL THEN RAISE EXCEPTION 'AGENT_NETWORK_NOT_SET'; END IF;
  SELECT * INTO v_pkg FROM public.packages WHERE id = _package_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'PACKAGE_NOT_FOUND'; END IF;
  IF v_pkg.network_id <> v_agent_net THEN RAISE EXCEPTION 'PACKAGE_NOT_IN_YOUR_NETWORK'; END IF;
  SELECT * INTO v_net FROM public.networks WHERE id = v_pkg.network_id;
  INSERT INTO public.card_requests (agent_id, agent_username, package_id, network_id, package_name, network_name,
    quantity, notes, payment_method, unit_price, total_value)
  VALUES (v_uid, v_username, v_pkg.id, v_net.id, v_pkg.name, v_net.name, _quantity, NULLIF(trim(_notes),''),
    v_pm, v_pkg.price, v_pkg.price * _quantity)
  RETURNING id INTO v_id;
  INSERT INTO public.logs (user_id, actor_username, action, entity, entity_id, metadata)
  VALUES (v_uid, v_username, 'REQUEST_CARDS', 'card_request', v_id,
          jsonb_build_object('package', v_pkg.name, 'quantity', _quantity, 'payment_method', v_pm));
  RETURN v_id;
END; $$;


--
-- Name: sell_card("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."sell_card"("_package_id" "uuid") RETURNS TABLE("sale_id" "uuid", "transaction_no" "text", "card_username" "text", "card_password" "text", "package_name" "text", "network_name" "text", "price" numeric, "sold_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_uid UUID := auth.uid(); v_username TEXT; v_card RECORD; v_pkg RECORD; v_net RECORD;
        v_sale_id UUID; v_tx TEXT; v_admin_net UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.is_active_user(v_uid) THEN RAISE EXCEPTION 'ACCOUNT_INACTIVE'; END IF;
  v_admin_net := public.admin_network(v_uid);
  IF v_admin_net IS NULL AND NOT public.has_role(v_uid,'agent') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT p.username INTO v_username FROM public.profiles p WHERE p.id = v_uid;
  SELECT * INTO v_pkg FROM public.packages WHERE id = _package_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'PACKAGE_NOT_FOUND'; END IF;
  SELECT * INTO v_net FROM public.networks WHERE id = v_pkg.network_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'NETWORK_INACTIVE'; END IF;
  IF v_admin_net IS NOT NULL THEN
    IF v_pkg.network_id <> v_admin_net THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
    SELECT * INTO v_card FROM public.cards
      WHERE package_id = _package_id AND status IN ('AVAILABLE','ASSIGNED')
      ORDER BY (status='AVAILABLE') DESC, created_at ASC
      FOR UPDATE SKIP LOCKED LIMIT 1;
  ELSE
    SELECT * INTO v_card FROM public.cards
      WHERE package_id = _package_id AND status='ASSIGNED' AND assigned_to = v_uid
      ORDER BY assigned_at ASC NULLS LAST, created_at ASC
      FOR UPDATE SKIP LOCKED LIMIT 1;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_CARDS_AVAILABLE'; END IF;
  UPDATE public.cards SET status='SOLD', sold_to=v_uid, sold_at=now() WHERE id = v_card.id;
  INSERT INTO public.sales (card_id, package_id, network_id, agent_id, price, package_name, network_name, agent_username)
  VALUES (v_card.id, v_pkg.id, v_net.id, v_uid, v_pkg.price, v_pkg.name, v_net.name, v_username)
  RETURNING public.sales.id, public.sales.transaction_no INTO v_sale_id, v_tx;
  INSERT INTO public.logs (user_id, actor_username, action, entity, entity_id, metadata)
  VALUES (v_uid, v_username, 'SELL_CARD', 'sale', v_sale_id,
          jsonb_build_object('package', v_pkg.name, 'network', v_net.name, 'price', v_pkg.price));
  RETURN QUERY SELECT v_sale_id, v_tx, v_card.username, v_card.password,
                      v_pkg.name, v_net.name, v_pkg.price, now();
END; $$;


--
-- Name: set_agent_active("uuid", boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."set_agent_active"("_agent_id" "uuid", "_active" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_net UUID := public.admin_network(auth.uid());
BEGIN
  IF v_net IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=_agent_id AND network_id=v_net) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  UPDATE public.profiles SET is_active = _active WHERE id = _agent_id;
END; $$;


--
-- Name: set_agent_network("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."set_agent_network"("_agent_id" "uuid", "_network_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_uid UUID := auth.uid(); v_net UUID := public.admin_network(v_uid);
BEGIN
  IF v_net IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _network_id IS NOT NULL AND _network_id <> v_net THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  -- Only allow reassigning agents already in this network (or unassigned)
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _agent_id AND (network_id IS NULL OR network_id = v_net)
  ) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  UPDATE public.profiles SET network_id = _network_id WHERE id = _agent_id;
  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (v_uid, 'SET_AGENT_NETWORK', 'profile', _agent_id, jsonb_build_object('network_id', _network_id));
END; $$;


--
-- Name: settle_agent_debt("uuid", numeric, "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."settle_agent_debt"("_agent_id" "uuid", "_amount" numeric, "_note" "text" DEFAULT NULL::"text") RETURNS TABLE("applied" numeric, "remaining_debt" numeric, "payments_count" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_net uuid := public.admin_network(v_uid);
  v_username text;
  v_req RECORD;
  v_left numeric := COALESCE(_amount, 0);
  v_applied numeric := 0;
  v_count int := 0;
  v_alloc numeric;
  v_req_remaining numeric;
  v_total_debt numeric := 0;
BEGIN
  IF v_net IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _agent_id AND network_id = v_net) THEN
    RAISE EXCEPTION 'AGENT_NOT_IN_NETWORK';
  END IF;

  SELECT username INTO v_username FROM public.profiles WHERE id = v_uid;

  FOR v_req IN
    SELECT id, total_value, paid_amount
    FROM public.card_requests
    WHERE agent_id = _agent_id
      AND network_id = v_net
      AND status = 'APPROVED'
      AND COALESCE(total_value,0) - COALESCE(paid_amount,0) > 0
    ORDER BY decided_at ASC NULLS LAST, created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_left <= 0;
    v_req_remaining := COALESCE(v_req.total_value,0) - COALESCE(v_req.paid_amount,0);
    v_alloc := LEAST(v_left, v_req_remaining);
    IF v_alloc <= 0 THEN CONTINUE; END IF;

    INSERT INTO public.request_payments (request_id, amount, note, recorded_by, recorded_by_username)
    VALUES (v_req.id, v_alloc, NULLIF(trim(_note),''), v_uid, v_username);

    UPDATE public.card_requests
    SET paid_amount = COALESCE(paid_amount,0) + v_alloc
    WHERE id = v_req.id;

    v_applied := v_applied + v_alloc;
    v_left := v_left - v_alloc;
    v_count := v_count + 1;
  END LOOP;

  SELECT COALESCE(SUM(COALESCE(total_value,0) - COALESCE(paid_amount,0)), 0)
  INTO v_total_debt
  FROM public.card_requests
  WHERE agent_id = _agent_id AND network_id = v_net AND status = 'APPROVED';

  INSERT INTO public.logs (user_id, actor_username, action, entity, entity_id, metadata)
  VALUES (v_uid, v_username, 'SETTLE_AGENT_DEBT', 'profile', _agent_id,
          jsonb_build_object('amount', _amount, 'applied', v_applied, 'remaining_debt', v_total_debt, 'note', _note));

  RETURN QUERY SELECT v_applied, v_total_debt, v_count;
END;
$$;


--
-- Name: superadmin_agents(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."superadmin_agents"() RETURNS TABLE("id" "uuid", "username" "text", "full_name" "text", "phone" "text", "is_active" boolean, "network_id" "uuid", "network_name" "text", "role" "text", "sold_count" integer, "sold_value" numeric, "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN QUERY
  SELECT p.id, p.username, p.full_name, p.phone, p.is_active,
         p.network_id, n.name,
         COALESCE((SELECT ur.role::text FROM user_roles ur WHERE ur.user_id=p.id ORDER BY (ur.role='superadmin'::app_role) DESC, (ur.role='admin'::app_role) DESC LIMIT 1), ''),
         (SELECT count(*)::int FROM sales s WHERE s.agent_id=p.id),
         (SELECT COALESCE(sum(price),0) FROM sales s WHERE s.agent_id=p.id),
         p.created_at
  FROM profiles p LEFT JOIN networks n ON n.id = p.network_id
  WHERE NOT public.is_superadmin(p.id)
  ORDER BY p.created_at DESC;
END; $$;


--
-- Name: superadmin_cards("uuid", "uuid", "text", "text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."superadmin_cards"("_network_id" "uuid" DEFAULT NULL::"uuid", "_package_id" "uuid" DEFAULT NULL::"uuid", "_status" "text" DEFAULT NULL::"text", "_search" "text" DEFAULT NULL::"text", "_limit" integer DEFAULT 500) RETURNS TABLE("id" "uuid", "username" "text", "password" "text", "status" "text", "package_id" "uuid", "package_name" "text", "network_id" "uuid", "network_name" "text", "assigned_to" "uuid", "assigned_username" "text", "sold_to" "uuid", "sold_username" "text", "created_at" timestamp with time zone, "assigned_at" timestamp with time zone, "sold_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_q text;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  v_q := NULLIF(trim(COALESCE(_search,'')),'');
  RETURN QUERY
  SELECT c.id, c.username, c.password, c.status::text,
         c.package_id, p.name, c.network_id, n.name,
         c.assigned_to, pa.username, c.sold_to, ps.username,
         c.created_at, c.assigned_at, c.sold_at
  FROM cards c
  JOIN packages p ON p.id = c.package_id
  JOIN networks n ON n.id = c.network_id
  LEFT JOIN profiles pa ON pa.id = c.assigned_to
  LEFT JOIN profiles ps ON ps.id = c.sold_to
  WHERE (_network_id IS NULL OR c.network_id = _network_id)
    AND (_package_id IS NULL OR c.package_id = _package_id)
    AND (_status IS NULL OR c.status::text = _status)
    AND (v_q IS NULL OR c.username ILIKE '%'||v_q||'%' OR COALESCE(c.password,'') ILIKE '%'||v_q||'%')
  ORDER BY c.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 2000));
END; $$;


--
-- Name: superadmin_create_network("text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."superadmin_create_network"("_name" "text", "_currency" "text" DEFAULT 'ر.س'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_uid uuid := auth.uid(); v_name text := NULLIF(trim(_name),''); v_id uuid;
BEGIN
  IF NOT public.is_superadmin(v_uid) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_name IS NULL THEN RAISE EXCEPTION 'NETWORK_NAME_REQUIRED'; END IF;
  IF EXISTS (SELECT 1 FROM public.networks WHERE lower(name)=lower(v_name)) THEN
    RAISE EXCEPTION 'NETWORK_NAME_TAKEN';
  END IF;
  INSERT INTO public.networks (name, currency, is_active, created_by)
  VALUES (v_name, COALESCE(NULLIF(trim(_currency),''),'ر.س'), true, v_uid)
  RETURNING id INTO v_id;
  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (v_uid, 'CREATE_NETWORK', 'network', v_id, jsonb_build_object('name', v_name));
  RETURN v_id;
END; $$;


--
-- Name: superadmin_create_package("uuid", "text", numeric, "text", "text", "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."superadmin_create_package"("_network_id" "uuid", "_name" "text", "_price" numeric, "_data_size" "text" DEFAULT NULL::"text", "_speed" "text" DEFAULT NULL::"text", "_validity" "text" DEFAULT NULL::"text", "_allowed_time" "text" DEFAULT NULL::"text", "_color" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_uid uuid := auth.uid(); v_name text := NULLIF(trim(_name),''); v_id uuid;
BEGIN
  IF NOT public.is_superadmin(v_uid) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_name IS NULL THEN RAISE EXCEPTION 'PACKAGE_NAME_REQUIRED'; END IF;
  IF _price IS NULL OR _price < 0 THEN RAISE EXCEPTION 'INVALID_PRICE'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.networks WHERE id = _network_id) THEN
    RAISE EXCEPTION 'NETWORK_NOT_FOUND';
  END IF;
  INSERT INTO public.packages (network_id, name, price, data_size, speed, validity, allowed_time, color, is_active)
  VALUES (_network_id, v_name, _price,
          NULLIF(trim(_data_size),''), NULLIF(trim(_speed),''), NULLIF(trim(_validity),''),
          NULLIF(trim(_allowed_time),''), COALESCE(NULLIF(trim(_color),''),'#009688'), true)
  RETURNING id INTO v_id;
  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (v_uid, 'CREATE_PACKAGE', 'package', v_id,
          jsonb_build_object('name', v_name, 'price', _price, 'network_id', _network_id));
  RETURN v_id;
END; $$;


--
-- Name: superadmin_delete_network("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."superadmin_delete_network"("_network_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_deleted jsonb := '{}'::jsonb;
  v_c int;
  v_agent_ids uuid[];
  v_owner_id uuid;
BEGIN
  IF NOT public.is_superadmin(v_uid) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _network_id IS NULL THEN RAISE EXCEPTION 'NETWORK_ID_REQUIRED'; END IF;

  SELECT owner_id INTO v_owner_id FROM public.networks WHERE id = _network_id;
  IF v_owner_id IS NULL AND NOT EXISTS (SELECT 1 FROM public.networks WHERE id = _network_id) THEN
    RAISE EXCEPTION 'NETWORK_NOT_FOUND';
  END IF;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_agent_ids
  FROM public.profiles WHERE network_id = _network_id AND NOT public.is_superadmin(id);

  WITH d AS (DELETE FROM public.request_payments rp
    USING public.card_requests cr
    WHERE rp.request_id = cr.id AND cr.network_id = _network_id RETURNING rp.id)
    SELECT count(*) INTO v_c FROM d;
  v_deleted := v_deleted || jsonb_build_object('request_payments', v_c);

  DELETE FROM public.sales WHERE network_id = _network_id;
  GET DIAGNOSTICS v_c = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('sales', v_c);

  DELETE FROM public.card_requests WHERE network_id = _network_id;
  GET DIAGNOSTICS v_c = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('card_requests', v_c);

  DELETE FROM public.cards WHERE network_id = _network_id;
  GET DIAGNOSTICS v_c = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('cards', v_c);

  DELETE FROM public.packages WHERE network_id = _network_id;
  GET DIAGNOSTICS v_c = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('packages', v_c);

  DELETE FROM public.join_requests WHERE network_id = _network_id;
  GET DIAGNOSTICS v_c = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('join_requests', v_c);

  DELETE FROM public.logs WHERE user_id = ANY(v_agent_ids);
  GET DIAGNOSTICS v_c = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('logs', v_c);

  UPDATE public.profiles SET network_id = NULL WHERE network_id = _network_id;

  DELETE FROM public.user_roles WHERE user_id = ANY(v_agent_ids);
  DELETE FROM public.profiles WHERE id = ANY(v_agent_ids);
  GET DIAGNOSTICS v_c = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('agents_deleted', v_c);

  DELETE FROM auth.users WHERE id = ANY(v_agent_ids);

  DELETE FROM public.networks WHERE id = _network_id;
  GET DIAGNOSTICS v_c = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('network_deleted', v_c);

  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (v_uid, 'SUPERADMIN_DELETE_NETWORK', 'network', _network_id, v_deleted);

  RETURN v_deleted;
END;
$$;


--
-- Name: superadmin_networks(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."superadmin_networks"() RETURNS TABLE("id" "uuid", "name" "text", "currency" "text", "is_active" boolean, "owner_id" "uuid", "owner_username" "text", "owner_phone" "text", "agents_count" integer, "packages_count" integer, "cards_count" integer, "sold_count" integer, "sold_value" numeric, "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN QUERY
  SELECT n.id, n.name, n.currency, n.is_active, n.owner_id,
         p.username, p.phone,
         (SELECT count(*)::int FROM profiles pr JOIN user_roles ur ON ur.user_id=pr.id WHERE pr.network_id=n.id AND ur.role='agent'::app_role),
         (SELECT count(*)::int FROM packages WHERE network_id=n.id),
         (SELECT count(*)::int FROM cards WHERE network_id=n.id),
         (SELECT count(*)::int FROM cards WHERE network_id=n.id AND status='SOLD'),
         (SELECT COALESCE(sum(price),0) FROM sales WHERE network_id=n.id),
         n.created_at
  FROM networks n LEFT JOIN profiles p ON p.id = n.owner_id
  ORDER BY n.created_at DESC;
END; $$;


--
-- Name: superadmin_packages(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."superadmin_packages"() RETURNS TABLE("id" "uuid", "name" "text", "price" numeric, "currency" "text", "network_id" "uuid", "network_name" "text", "is_active" boolean, "available" integer, "assigned" integer, "sold" integer, "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN QUERY
  SELECT p.id, p.name, p.price, n.currency, p.network_id, n.name,
         p.is_active,
         (SELECT count(*)::int FROM cards c WHERE c.package_id=p.id AND c.status='AVAILABLE'),
         (SELECT count(*)::int FROM cards c WHERE c.package_id=p.id AND c.status='ASSIGNED'),
         (SELECT count(*)::int FROM cards c WHERE c.package_id=p.id AND c.status='SOLD'),
         p.created_at
  FROM packages p JOIN networks n ON n.id = p.network_id
  ORDER BY n.name, p.price DESC;
END; $$;


--
-- Name: superadmin_set_network_active("uuid", boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."superadmin_set_network_active"("_network_id" "uuid", "_active" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT public.is_superadmin(v_uid) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  UPDATE public.networks SET is_active = _active WHERE id = _network_id;
  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (v_uid, CASE WHEN _active THEN 'ACTIVATE_NETWORK' ELSE 'SUSPEND_NETWORK' END,
          'network', _network_id, jsonb_build_object('is_active', _active));
END; $$;


--
-- Name: superadmin_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."superadmin_stats"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT jsonb_build_object(
    'networks',      (SELECT count(*) FROM networks),
    'active_networks',(SELECT count(*) FROM networks WHERE is_active),
    'agents',        (SELECT count(*) FROM user_roles WHERE role='agent'::app_role),
    'admins',        (SELECT count(*) FROM user_roles WHERE role='admin'::app_role),
    'packages',      (SELECT count(*) FROM packages),
    'total_cards',   (SELECT count(*) FROM cards),
    'available',     (SELECT count(*) FROM cards WHERE status='AVAILABLE'),
    'assigned',      (SELECT count(*) FROM cards WHERE status='ASSIGNED'),
    'sold',          (SELECT count(*) FROM cards WHERE status='SOLD'),
    'sold_value',    (SELECT COALESCE(sum(price),0) FROM sales),
    'available_value',(SELECT COALESCE(sum(p.price),0) FROM cards c JOIN packages p ON p.id=c.package_id WHERE c.status='AVAILABLE')
  ) INTO v;
  RETURN v;
END; $$;


--
-- Name: touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;


--
-- Name: username_from_phone("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."username_from_phone"("_phone" "text") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT username
  FROM public.profiles
  WHERE regexp_replace(COALESCE(phone, ''), '\D', '', 'g') = regexp_replace(COALESCE(_phone, ''), '\D', '', 'g')
  LIMIT 1;
$$;


SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: card_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."card_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agent_id" "uuid" NOT NULL,
    "agent_username" "text" NOT NULL,
    "package_id" "uuid" NOT NULL,
    "network_id" "uuid" NOT NULL,
    "package_name" "text" NOT NULL,
    "network_name" "text" NOT NULL,
    "quantity" integer NOT NULL,
    "approved_quantity" integer,
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "notes" "text",
    "reject_reason" "text",
    "decided_by" "uuid",
    "decided_at" timestamp with time zone,
    "payment_method" "text" DEFAULT 'CREDIT'::"text" NOT NULL,
    "unit_price" numeric(12,2) DEFAULT 0 NOT NULL,
    "total_value" numeric(12,2) DEFAULT 0 NOT NULL,
    "paid_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "card_requests_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['CASH'::"text", 'CREDIT'::"text"]))),
    CONSTRAINT "card_requests_quantity_check" CHECK (("quantity" > 0)),
    CONSTRAINT "card_requests_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'APPROVED'::"text", 'REJECTED'::"text"])))
);


--
-- Name: cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."cards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "package_id" "uuid" NOT NULL,
    "network_id" "uuid" NOT NULL,
    "username" "text" NOT NULL,
    "password" "text",
    "status" "public"."card_status" DEFAULT 'AVAILABLE'::"public"."card_status" NOT NULL,
    "sold_to" "uuid",
    "sold_at" timestamp with time zone,
    "assigned_to" "uuid",
    "assigned_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: join_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."join_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "network_id" "uuid" NOT NULL,
    "agent_id" "uuid" NOT NULL,
    "agent_username" "text" NOT NULL,
    "agent_full_name" "text",
    "agent_phone" "text",
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "reject_reason" "text",
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "decided_at" timestamp with time zone,
    "decided_by" "uuid",
    CONSTRAINT "join_requests_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'APPROVED'::"text", 'REJECTED'::"text"])))
);


--
-- Name: logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "actor_username" "text",
    "action" "text" NOT NULL,
    "entity" "text",
    "entity_id" "uuid",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: networks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."networks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "currency" "text" DEFAULT 'ر.س'::"text" NOT NULL,
    "primary_color" "text" DEFAULT '#009688'::"text" NOT NULL,
    "secondary_color" "text" DEFAULT '#14B8A6'::"text" NOT NULL,
    "logo_url" "text",
    "cover_url" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "owner_id" "uuid"
);


--
-- Name: packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."packages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "network_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "price" numeric(12,2) NOT NULL,
    "data_size" "text",
    "speed" "text",
    "validity" "text",
    "description" "text",
    "color" "text" DEFAULT '#009688'::"text",
    "icon" "text" DEFAULT 'wifi'::"text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "allowed_time" "text",
    CONSTRAINT "packages_price_check" CHECK (("price" >= (0)::numeric))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."profiles" (
    "id" "uuid" NOT NULL,
    "username" "text" NOT NULL,
    "full_name" "text",
    "is_active" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "phone" "text",
    "network_id" "uuid"
);


--
-- Name: request_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."request_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "note" "text",
    "recorded_by" "uuid" NOT NULL,
    "recorded_by_username" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "request_payments_amount_check" CHECK (("amount" > (0)::numeric))
);


--
-- Name: sales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."sales" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "transaction_no" "text" DEFAULT ((('TX-'::"text" || "to_char"("now"(), 'YYYYMMDD'::"text")) || '-'::"text") || "lpad"(("floor"(("random"() * (100000)::double precision)))::"text", 5, '0'::"text")) NOT NULL,
    "card_id" "uuid" NOT NULL,
    "package_id" "uuid" NOT NULL,
    "network_id" "uuid" NOT NULL,
    "agent_id" "uuid" NOT NULL,
    "price" numeric(12,2) NOT NULL,
    "package_name" "text" NOT NULL,
    "network_name" "text" NOT NULL,
    "agent_username" "text" NOT NULL,
    "sold_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."app_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Data for Name: card_requests; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO "public"."card_requests" ("id", "agent_id", "agent_username", "package_id", "network_id", "package_name", "network_name", "quantity", "approved_quantity", "status", "notes", "reject_reason", "decided_by", "decided_at", "payment_method", "unit_price", "total_value", "paid_amount", "created_at", "updated_at") VALUES ('1b14ab74-8139-4dbe-97a1-dc381c27d322', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', 'u778492883', '9cfea196-ce3d-4843-8d5c-df310bfa0e07', '9534b2cd-a133-4629-9056-8eb5043bf354', 'شهريه', 'الواثق نت الفضائية', 10, 10, 'APPROVED', NULL, NULL, 'bb568927-a332-4fe5-a636-a4dd67cc4e57', '2026-07-24 12:57:59.686627+00', 'CREDIT', 30.00, 300.00, 0.00, '2026-07-24 12:57:14.597946+00', '2026-07-24 12:57:59.686627+00');
INSERT INTO "public"."card_requests" ("id", "agent_id", "agent_username", "package_id", "network_id", "package_name", "network_name", "quantity", "approved_quantity", "status", "notes", "reject_reason", "decided_by", "decided_at", "payment_method", "unit_price", "total_value", "paid_amount", "created_at", "updated_at") VALUES ('39a4da78-2bda-4573-8cdb-d32bb1ccaa53', 'c22e26ca-03bd-419a-8f40-89a3ae772247', 'u778492885', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', 'باقــــة شهري', 'الزري نت اللاسلكية', 10, 10, 'APPROVED', NULL, NULL, 'de380cef-b6f1-4070-80d4-096d1b1f4c76', '2026-07-24 18:05:47.567124+00', 'CREDIT', 30.00, 300.00, 300.00, '2026-07-24 18:05:38.58966+00', '2026-07-24 18:09:20.246184+00');
INSERT INTO "public"."card_requests" ("id", "agent_id", "agent_username", "package_id", "network_id", "package_name", "network_name", "quantity", "approved_quantity", "status", "notes", "reject_reason", "decided_by", "decided_at", "payment_method", "unit_price", "total_value", "paid_amount", "created_at", "updated_at") VALUES ('9ea0df97-ee33-4385-878b-03718e99fb7a', 'c22e26ca-03bd-419a-8f40-89a3ae772247', 'u778492885', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', 'باقــــة شهري', 'الزري نت اللاسلكية', 10, 5, 'APPROVED', NULL, NULL, 'de380cef-b6f1-4070-80d4-096d1b1f4c76', '2026-07-24 11:49:15.980167+00', 'CREDIT', 30.00, 150.00, 150.00, '2026-07-24 11:48:52.089924+00', '2026-07-24 11:51:53.429745+00');
INSERT INTO "public"."card_requests" ("id", "agent_id", "agent_username", "package_id", "network_id", "package_name", "network_name", "quantity", "approved_quantity", "status", "notes", "reject_reason", "decided_by", "decided_at", "payment_method", "unit_price", "total_value", "paid_amount", "created_at", "updated_at") VALUES ('f4694e46-ce52-4091-8e90-5bc650ba41b1', 'd39b2b0f-80a7-44bd-93a1-a611baf470fd', 'u775649620', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', 'باقــــة شهري', 'الزري نت اللاسلكية', 10, 0, 'APPROVED', NULL, NULL, 'de380cef-b6f1-4070-80d4-096d1b1f4c76', '2026-07-23 17:59:51.680238+00', 'CREDIT', 30.00, 0.00, 0.00, '2026-07-23 17:59:06.968473+00', '2026-07-23 18:00:23.534505+00');
INSERT INTO "public"."card_requests" ("id", "agent_id", "agent_username", "package_id", "network_id", "package_name", "network_name", "quantity", "approved_quantity", "status", "notes", "reject_reason", "decided_by", "decided_at", "payment_method", "unit_price", "total_value", "paid_amount", "created_at", "updated_at") VALUES ('9de5eba5-f090-4286-844b-0f486465f60b', '115cc622-7b6e-4324-a75f-91d14cf2c053', 'u778561310', '9cfea196-ce3d-4843-8d5c-df310bfa0e07', '9534b2cd-a133-4629-9056-8eb5043bf354', 'شهريه', 'شبكه الاتحاد الفضائية', 6, 6, 'APPROVED', NULL, NULL, 'bb568927-a332-4fe5-a636-a4dd67cc4e57', '2026-07-24 23:49:35.578343+00', 'CREDIT', 30.00, 180.00, 0.00, '2026-07-24 23:48:22.859137+00', '2026-07-24 23:49:35.578343+00');
INSERT INTO "public"."card_requests" ("id", "agent_id", "agent_username", "package_id", "network_id", "package_name", "network_name", "quantity", "approved_quantity", "status", "notes", "reject_reason", "decided_by", "decided_at", "payment_method", "unit_price", "total_value", "paid_amount", "created_at", "updated_at") VALUES ('8abf1d53-5490-4dbe-b576-69859e9f1900', 'd39b2b0f-80a7-44bd-93a1-a611baf470fd', 'u775649620', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', 'باقــــة شهري', 'الزري نت اللاسلكية', 10, 10, 'APPROVED', NULL, NULL, 'cf7a1ea4-c73e-4da8-a3a3-33e59bfe02cd', '2026-07-26 10:52:29.130849+00', 'CREDIT', 30.00, 300.00, 0.00, '2026-07-26 10:46:19.995097+00', '2026-07-26 10:52:29.130849+00');
INSERT INTO "public"."card_requests" ("id", "agent_id", "agent_username", "package_id", "network_id", "package_name", "network_name", "quantity", "approved_quantity", "status", "notes", "reject_reason", "decided_by", "decided_at", "payment_method", "unit_price", "total_value", "paid_amount", "created_at", "updated_at") VALUES ('9ffba834-2a46-4fd2-81d3-fd430bc03171', '025e2f6e-9e49-44e3-9b3c-9a7b75330d9d', 'u777020155', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', 'باقــــة شهري', 'الزري نت اللاسلكية', 10, 10, 'APPROVED', NULL, NULL, 'de380cef-b6f1-4070-80d4-096d1b1f4c76', '2026-07-21 13:32:27.553711+00', 'CREDIT', 30.00, 300.00, 0.00, '2026-07-21 13:30:19.406228+00', '2026-07-21 13:32:27.553711+00');
INSERT INTO "public"."card_requests" ("id", "agent_id", "agent_username", "package_id", "network_id", "package_name", "network_name", "quantity", "approved_quantity", "status", "notes", "reject_reason", "decided_by", "decided_at", "payment_method", "unit_price", "total_value", "paid_amount", "created_at", "updated_at") VALUES ('3d540bdd-cc6e-4b19-8e3f-6d22265986ec', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', 'u778492883', '9cfea196-ce3d-4843-8d5c-df310bfa0e07', '9534b2cd-a133-4629-9056-8eb5043bf354', 'شهريه', 'الواثق نت الفضائية', 10, 1, 'APPROVED', NULL, NULL, 'bb568927-a332-4fe5-a636-a4dd67cc4e57', '2026-07-24 12:07:46.719823+00', 'CREDIT', 30.00, 30.00, 0.00, '2026-07-24 12:07:40.143579+00', '2026-07-24 12:09:44.600977+00');
INSERT INTO "public"."card_requests" ("id", "agent_id", "agent_username", "package_id", "network_id", "package_name", "network_name", "quantity", "approved_quantity", "status", "notes", "reject_reason", "decided_by", "decided_at", "payment_method", "unit_price", "total_value", "paid_amount", "created_at", "updated_at") VALUES ('9dfeeaad-dba0-46ea-a6aa-cd973228ce38', 'c22e26ca-03bd-419a-8f40-89a3ae772247', 'u778492885', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', 'باقــــة شهري', 'الزري نت اللاسلكية', 10, 0, 'APPROVED', NULL, NULL, 'de380cef-b6f1-4070-80d4-096d1b1f4c76', '2026-07-24 12:54:18.80135+00', 'CREDIT', 30.00, 0.00, 0.00, '2026-07-24 12:53:55.003967+00', '2026-07-24 18:04:34.547261+00');
INSERT INTO "public"."card_requests" ("id", "agent_id", "agent_username", "package_id", "network_id", "package_name", "network_name", "quantity", "approved_quantity", "status", "notes", "reject_reason", "decided_by", "decided_at", "payment_method", "unit_price", "total_value", "paid_amount", "created_at", "updated_at") VALUES ('a299e0d3-2c3c-4351-83a7-00501310d570', 'c22e26ca-03bd-419a-8f40-89a3ae772247', 'u778492885', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', 'باقــــة شهري', 'الزري نت اللاسلكية', 1, 1, 'APPROVED', NULL, NULL, 'de380cef-b6f1-4070-80d4-096d1b1f4c76', '2026-07-21 13:52:08.838778+00', 'CREDIT', 30.00, 30.00, 30.00, '2026-07-21 13:51:22.971338+00', '2026-07-22 02:29:22.145368+00');
INSERT INTO "public"."card_requests" ("id", "agent_id", "agent_username", "package_id", "network_id", "package_name", "network_name", "quantity", "approved_quantity", "status", "notes", "reject_reason", "decided_by", "decided_at", "payment_method", "unit_price", "total_value", "paid_amount", "created_at", "updated_at") VALUES ('31a3ce6c-1cad-4d06-89e5-f9d1c5a9b266', 'c22e26ca-03bd-419a-8f40-89a3ae772247', 'u778492885', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', 'باقــــة شهري', 'الزري نت اللاسلكية', 1, 1, 'APPROVED', NULL, NULL, 'de380cef-b6f1-4070-80d4-096d1b1f4c76', '2026-07-22 00:15:15.834177+00', 'CREDIT', 30.00, 30.00, 30.00, '2026-07-22 00:15:02.350532+00', '2026-07-22 02:29:22.145368+00');
INSERT INTO "public"."card_requests" ("id", "agent_id", "agent_username", "package_id", "network_id", "package_name", "network_name", "quantity", "approved_quantity", "status", "notes", "reject_reason", "decided_by", "decided_at", "payment_method", "unit_price", "total_value", "paid_amount", "created_at", "updated_at") VALUES ('93674192-011b-46a5-8218-6c45d786fb0d', 'c22e26ca-03bd-419a-8f40-89a3ae772247', 'u778492885', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', 'باقــــة شهري', 'الزري نت اللاسلكية', 1, 1, 'APPROVED', NULL, NULL, 'de380cef-b6f1-4070-80d4-096d1b1f4c76', '2026-07-22 12:34:18.703463+00', 'CREDIT', 30.00, 30.00, 30.00, '2026-07-22 12:34:08.920997+00', '2026-07-22 12:36:06.871985+00');
INSERT INTO "public"."card_requests" ("id", "agent_id", "agent_username", "package_id", "network_id", "package_name", "network_name", "quantity", "approved_quantity", "status", "notes", "reject_reason", "decided_by", "decided_at", "payment_method", "unit_price", "total_value", "paid_amount", "created_at", "updated_at") VALUES ('5d673fe0-dc45-4c84-b83e-fed961d41622', 'c22e26ca-03bd-419a-8f40-89a3ae772247', 'u778492885', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', 'باقــــة شهري', 'الزري نت اللاسلكية', 1, 1, 'APPROVED', NULL, NULL, 'de380cef-b6f1-4070-80d4-096d1b1f4c76', '2026-07-22 12:44:44.141521+00', 'CREDIT', 30.00, 30.00, 30.00, '2026-07-22 12:44:31.024685+00', '2026-07-22 12:48:04.023872+00');
INSERT INTO "public"."card_requests" ("id", "agent_id", "agent_username", "package_id", "network_id", "package_name", "network_name", "quantity", "approved_quantity", "status", "notes", "reject_reason", "decided_by", "decided_at", "payment_method", "unit_price", "total_value", "paid_amount", "created_at", "updated_at") VALUES ('12590826-4d0a-467e-b5ef-0302a7c2dcd4', 'e608fa82-347a-4ed2-b838-33af5a4fde4a', 'u774818215', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', 'باقــــة شهري', 'الزري نت اللاسلكية', 10, 5, 'APPROVED', NULL, NULL, 'de380cef-b6f1-4070-80d4-096d1b1f4c76', '2026-07-21 14:32:58.331598+00', 'CREDIT', 30.00, 150.00, 0.00, '2026-07-21 14:29:30.093022+00', '2026-07-22 17:20:44.902927+00');


--
-- Data for Name: cards; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('05d1bfb1-5b90-4345-9455-af8420ae08f1', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '096866207', NULL, 'SOLD', 'e608fa82-347a-4ed2-b838-33af5a4fde4a', '2026-07-21 16:04:22.826763+00', 'e608fa82-347a-4ed2-b838-33af5a4fde4a', '2026-07-21 14:32:58.331598+00', '2026-07-21 12:22:46.458384+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('5d8410b0-67fa-4117-a181-15bb6cdc06ea', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '895628646', NULL, 'SOLD', 'e608fa82-347a-4ed2-b838-33af5a4fde4a', '2026-07-21 16:05:01.853025+00', 'e608fa82-347a-4ed2-b838-33af5a4fde4a', '2026-07-21 14:32:58.331598+00', '2026-07-21 12:22:46.458384+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('56a7aa50-c7f1-43a3-932f-98e004355849', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '158938863', NULL, 'SOLD', 'e608fa82-347a-4ed2-b838-33af5a4fde4a', '2026-07-21 18:15:36.821189+00', 'e608fa82-347a-4ed2-b838-33af5a4fde4a', '2026-07-21 14:32:58.331598+00', '2026-07-21 12:22:46.458384+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('c604869d-6f1c-495c-bb6c-8b51e1e8df91', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '012101810', NULL, 'SOLD', 'e608fa82-347a-4ed2-b838-33af5a4fde4a', '2026-07-21 18:26:40.091035+00', 'e608fa82-347a-4ed2-b838-33af5a4fde4a', '2026-07-21 14:32:58.331598+00', '2026-07-21 12:22:46.458384+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('abde1c17-4871-4570-afc0-ff65c920dc17', '9cfea196-ce3d-4843-8d5c-df310bfa0e07', '9534b2cd-a133-4629-9056-8eb5043bf354', '74863290', NULL, 'SOLD', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', '2026-07-24 12:08:59.054207+00', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', '2026-07-24 12:07:46.719823+00', '2026-07-24 12:06:45.522559+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('0bde71d0-ec83-4601-a2fb-66ad39dbe2eb', '9cfea196-ce3d-4843-8d5c-df310bfa0e07', '9534b2cd-a133-4629-9056-8eb5043bf354', '06014258', NULL, 'ASSIGNED', NULL, NULL, '115cc622-7b6e-4324-a75f-91d14cf2c053', '2026-07-24 23:49:35.578343+00', '2026-07-24 12:06:45.522559+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('ea997a86-4349-4e58-956c-8d6c77c5bbe4', '9cfea196-ce3d-4843-8d5c-df310bfa0e07', '9534b2cd-a133-4629-9056-8eb5043bf354', '32841307', NULL, 'ASSIGNED', NULL, NULL, '115cc622-7b6e-4324-a75f-91d14cf2c053', '2026-07-24 23:49:35.578343+00', '2026-07-24 12:06:45.522559+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('3392d4ea-2390-49a3-8ce8-391b3edad33d', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '516294315', NULL, 'SOLD', '025e2f6e-9e49-44e3-9b3c-9a7b75330d9d', '2026-07-25 16:55:29.797812+00', '025e2f6e-9e49-44e3-9b3c-9a7b75330d9d', '2026-07-21 13:32:27.553711+00', '2026-07-21 12:22:46.458384+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('0b8b3a7b-544f-4c00-a187-b1c8613f9482', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '832436358', NULL, 'SOLD', '025e2f6e-9e49-44e3-9b3c-9a7b75330d9d', '2026-07-25 17:23:32.853893+00', '025e2f6e-9e49-44e3-9b3c-9a7b75330d9d', '2026-07-21 13:32:27.553711+00', '2026-07-21 12:22:46.458384+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('52df200c-ca46-4800-9e2e-e9a881bfcff8', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '236017577', NULL, 'AVAILABLE', NULL, NULL, NULL, NULL, '2026-07-25 23:27:53.868303+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('2f628e11-63a3-429c-a5b1-df67ccb16473', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '874926676', NULL, 'AVAILABLE', NULL, NULL, NULL, NULL, '2026-07-25 23:27:53.868303+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('2159ff6f-80e0-4ac1-8d31-516a30e7dfbc', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '289267708', NULL, 'AVAILABLE', NULL, NULL, NULL, NULL, '2026-07-25 23:27:53.868303+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('a47a527a-be24-4d3d-8b94-e95e2f0478e3', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '198113681', NULL, 'AVAILABLE', NULL, NULL, NULL, NULL, '2026-07-25 23:27:53.868303+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('15578de0-4f8c-47d5-a0b1-2e7d8d8e92d9', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '879342936', NULL, 'AVAILABLE', NULL, NULL, NULL, NULL, '2026-07-25 23:27:53.868303+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('e1688a86-15fb-4b25-b531-e56d12377da6', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '964389767', NULL, 'AVAILABLE', NULL, NULL, NULL, NULL, '2026-07-25 23:27:53.868303+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('219e3699-1ab3-49c8-b3bb-39a2b7001cff', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '936486652', NULL, 'AVAILABLE', NULL, NULL, NULL, NULL, '2026-07-25 23:27:53.868303+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('4e5c085c-0f20-4dfa-8546-c44f450bed1a', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '735314886', NULL, 'AVAILABLE', NULL, NULL, NULL, NULL, '2026-07-25 23:27:53.868303+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('01f10fee-d469-43c5-a24b-c3bef56b7cd5', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '316788595', NULL, 'AVAILABLE', NULL, NULL, NULL, NULL, '2026-07-25 23:27:53.868303+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('e12acc61-a6d4-46bf-9515-881dd0f6fa47', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '118766254', NULL, 'AVAILABLE', NULL, NULL, NULL, NULL, '2026-07-25 23:27:53.868303+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('98da579a-c023-4af1-b09d-6dab58d5e591', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '357528776', NULL, 'AVAILABLE', NULL, NULL, NULL, NULL, '2026-07-25 23:27:53.868303+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('cc0929bb-96a3-40d5-a8e1-062b6f14beb6', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '648863438', NULL, 'AVAILABLE', NULL, NULL, NULL, NULL, '2026-07-25 23:27:53.868303+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('2a55c739-c87f-45a6-8b56-35da89347a57', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '836607189', NULL, 'ASSIGNED', NULL, NULL, 'd39b2b0f-80a7-44bd-93a1-a611baf470fd', '2026-07-26 10:52:29.130849+00', '2026-07-21 12:22:46.458384+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('de88b69d-699b-4816-8d01-4e97c50804bf', '9cfea196-ce3d-4843-8d5c-df310bfa0e07', '9534b2cd-a133-4629-9056-8eb5043bf354', '22972085', NULL, 'SOLD', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', '2026-07-24 13:00:36.558412+00', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', '2026-07-24 12:57:59.686627+00', '2026-07-24 12:06:45.522559+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('00122cf3-ce1c-45a8-b460-97927e839e2e', '9cfea196-ce3d-4843-8d5c-df310bfa0e07', '9534b2cd-a133-4629-9056-8eb5043bf354', '42840948', NULL, 'SOLD', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', '2026-07-24 13:00:37.090126+00', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', '2026-07-24 12:57:59.686627+00', '2026-07-24 12:06:45.522559+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('be404140-1d6f-4c42-ada9-b80a9bf97c7e', '9cfea196-ce3d-4843-8d5c-df310bfa0e07', '9534b2cd-a133-4629-9056-8eb5043bf354', '87428809', NULL, 'SOLD', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', '2026-07-24 13:00:37.213167+00', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', '2026-07-24 12:57:59.686627+00', '2026-07-24 12:06:45.522559+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('35f29c9a-6e9c-4468-82de-107089056726', '9cfea196-ce3d-4843-8d5c-df310bfa0e07', '9534b2cd-a133-4629-9056-8eb5043bf354', '43473052', NULL, 'SOLD', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', '2026-07-24 13:00:37.328956+00', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', '2026-07-24 12:57:59.686627+00', '2026-07-24 12:06:45.522559+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('5e3fc8a6-db00-4205-900e-07736154d27f', '9cfea196-ce3d-4843-8d5c-df310bfa0e07', '9534b2cd-a133-4629-9056-8eb5043bf354', '76360574', NULL, 'SOLD', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', '2026-07-24 13:00:37.459677+00', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', '2026-07-24 12:57:59.686627+00', '2026-07-24 12:06:45.522559+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('2ad45d35-8589-4a89-92c6-31409543efff', '9cfea196-ce3d-4843-8d5c-df310bfa0e07', '9534b2cd-a133-4629-9056-8eb5043bf354', '87130568', NULL, 'SOLD', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', '2026-07-24 13:00:37.590641+00', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', '2026-07-24 12:57:59.686627+00', '2026-07-24 12:06:45.522559+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('c61587a5-bcca-4daf-931f-5a70e88c5516', '9cfea196-ce3d-4843-8d5c-df310bfa0e07', '9534b2cd-a133-4629-9056-8eb5043bf354', '73362769', NULL, 'SOLD', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', '2026-07-24 13:00:37.694785+00', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', '2026-07-24 12:57:59.686627+00', '2026-07-24 12:06:45.522559+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('1d4f9755-d406-4aab-8255-820364e9759b', '9cfea196-ce3d-4843-8d5c-df310bfa0e07', '9534b2cd-a133-4629-9056-8eb5043bf354', '20838153', NULL, 'SOLD', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', '2026-07-24 13:00:37.804172+00', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', '2026-07-24 12:57:59.686627+00', '2026-07-24 12:06:45.522559+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('b4a27069-afc4-486e-9a38-78af03d13421', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '342600869', NULL, 'ASSIGNED', NULL, NULL, 'd39b2b0f-80a7-44bd-93a1-a611baf470fd', '2026-07-26 10:52:29.130849+00', '2026-07-21 12:22:46.458384+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('b75d6cb5-fb5a-405d-8ff5-ee11392fd262', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '629825089', NULL, 'ASSIGNED', NULL, NULL, 'd39b2b0f-80a7-44bd-93a1-a611baf470fd', '2026-07-26 10:52:29.130849+00', '2026-07-21 12:22:46.458384+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('1ebe15eb-9c9d-4361-bdd1-dcafc715398e', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '316301402', NULL, 'ASSIGNED', NULL, NULL, 'd39b2b0f-80a7-44bd-93a1-a611baf470fd', '2026-07-26 10:52:29.130849+00', '2026-07-21 12:22:46.458384+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('9810df72-f5c9-4c93-bd51-4b85ef11b5b6', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '259111035', NULL, 'ASSIGNED', NULL, NULL, 'd39b2b0f-80a7-44bd-93a1-a611baf470fd', '2026-07-26 10:52:29.130849+00', '2026-07-21 12:22:46.458384+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('858053cb-4a51-41b4-a6ee-069ff3b6fe89', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '439708940', NULL, 'SOLD', 'd39b2b0f-80a7-44bd-93a1-a611baf470fd', '2026-07-26 11:40:41.668406+00', 'd39b2b0f-80a7-44bd-93a1-a611baf470fd', '2026-07-26 10:52:29.130849+00', '2026-07-21 12:22:46.458384+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('64911f5f-e9b0-4be8-9ab0-faf544d5ab68', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '076153238', NULL, 'ASSIGNED', NULL, NULL, '025e2f6e-9e49-44e3-9b3c-9a7b75330d9d', '2026-07-21 13:32:27.553711+00', '2026-07-21 12:22:46.458384+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('be9c8ac8-de73-4455-9c84-57d4aa7a526c', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '314361114', NULL, 'ASSIGNED', NULL, NULL, '025e2f6e-9e49-44e3-9b3c-9a7b75330d9d', '2026-07-21 13:32:27.553711+00', '2026-07-21 12:22:46.458384+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('03bc3b91-8cf7-4c40-ade4-4ffc5a4cf3fa', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '286822610', NULL, 'ASSIGNED', NULL, NULL, '025e2f6e-9e49-44e3-9b3c-9a7b75330d9d', '2026-07-21 13:32:27.553711+00', '2026-07-21 12:22:46.458384+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('fdeabd95-a92d-4559-b9e1-a0ca78b58e55', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '741394106', NULL, 'ASSIGNED', NULL, NULL, '025e2f6e-9e49-44e3-9b3c-9a7b75330d9d', '2026-07-21 13:32:27.553711+00', '2026-07-21 12:22:46.458384+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('0bd16a35-243f-4bed-ae17-d75c1060ece3', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '397399766', NULL, 'ASSIGNED', NULL, NULL, '025e2f6e-9e49-44e3-9b3c-9a7b75330d9d', '2026-07-21 13:32:27.553711+00', '2026-07-21 12:22:46.458384+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('84ff8fbd-f087-4503-8d8b-8d31fdd1e930', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '578194890', NULL, 'ASSIGNED', NULL, NULL, '025e2f6e-9e49-44e3-9b3c-9a7b75330d9d', '2026-07-21 13:32:27.553711+00', '2026-07-21 12:22:46.458384+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('dfdc3755-195c-4164-8cfe-afc4f17a8540', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '675315435', NULL, 'SOLD', '025e2f6e-9e49-44e3-9b3c-9a7b75330d9d', '2026-07-21 13:57:22.308049+00', '025e2f6e-9e49-44e3-9b3c-9a7b75330d9d', '2026-07-21 13:32:27.553711+00', '2026-07-21 12:22:46.458384+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('844158a5-fd86-4685-9830-58c50a10c46e', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '980557866', NULL, 'SOLD', '025e2f6e-9e49-44e3-9b3c-9a7b75330d9d', '2026-07-22 08:15:23.309796+00', '025e2f6e-9e49-44e3-9b3c-9a7b75330d9d', '2026-07-21 13:32:27.553711+00', '2026-07-21 12:22:46.458384+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('6d8ae1d2-bf1c-44f0-b693-ed2231e4209c', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '804522887', NULL, 'AVAILABLE', NULL, NULL, NULL, NULL, '2026-07-21 12:22:46.458384+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('ebe52ee9-a690-46b7-8b0c-a15bdcaa0fff', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '801456560', NULL, 'AVAILABLE', NULL, NULL, NULL, NULL, '2026-07-21 12:22:46.458384+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('a87f2fea-cd63-48b1-b10a-fb2bd1378fe1', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '658910680', NULL, 'AVAILABLE', NULL, NULL, NULL, NULL, '2026-07-21 12:22:46.458384+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('ce4d8aa3-f0b3-4da0-8d3d-538ad7678fd2', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '756183102', NULL, 'AVAILABLE', NULL, NULL, NULL, NULL, '2026-07-21 12:22:46.458384+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('c94d0e67-09b8-4e88-8a98-2159c634da54', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '760347092', NULL, 'AVAILABLE', NULL, NULL, NULL, NULL, '2026-07-21 12:22:46.458384+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('f035e3fe-f436-4e6c-bd16-6f3543d6f6bd', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '535280796', NULL, 'SOLD', 'e608fa82-347a-4ed2-b838-33af5a4fde4a', '2026-07-21 15:09:15.322675+00', 'e608fa82-347a-4ed2-b838-33af5a4fde4a', '2026-07-21 14:32:58.331598+00', '2026-07-21 12:22:46.458384+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('3414be86-135b-4a46-a4e7-73b0c1aa8f38', '9cfea196-ce3d-4843-8d5c-df310bfa0e07', '9534b2cd-a133-4629-9056-8eb5043bf354', '28654594', NULL, 'ASSIGNED', NULL, NULL, '115cc622-7b6e-4324-a75f-91d14cf2c053', '2026-07-24 23:49:35.578343+00', '2026-07-24 12:06:45.522559+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('0c57ea63-f671-48b5-b568-a3f3d616d8f5', '9cfea196-ce3d-4843-8d5c-df310bfa0e07', '9534b2cd-a133-4629-9056-8eb5043bf354', '03073322', NULL, 'ASSIGNED', NULL, NULL, '115cc622-7b6e-4324-a75f-91d14cf2c053', '2026-07-24 23:49:35.578343+00', '2026-07-24 12:06:45.522559+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('6a8666c9-2279-43b6-bc7c-8adaabf85a6d', '9cfea196-ce3d-4843-8d5c-df310bfa0e07', '9534b2cd-a133-4629-9056-8eb5043bf354', '05208782', NULL, 'ASSIGNED', NULL, NULL, '115cc622-7b6e-4324-a75f-91d14cf2c053', '2026-07-24 23:49:35.578343+00', '2026-07-24 12:06:45.522559+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('4e42d66b-17f5-4a12-98c9-92857487c5d0', '9cfea196-ce3d-4843-8d5c-df310bfa0e07', '9534b2cd-a133-4629-9056-8eb5043bf354', '34765593', NULL, 'ASSIGNED', NULL, NULL, '115cc622-7b6e-4324-a75f-91d14cf2c053', '2026-07-24 23:49:35.578343+00', '2026-07-24 12:06:45.522559+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('e6678a51-cf02-4d79-9fe6-157c25fa9024', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '164345907', NULL, 'ASSIGNED', NULL, NULL, 'd39b2b0f-80a7-44bd-93a1-a611baf470fd', '2026-07-26 10:52:29.130849+00', '2026-07-21 12:22:46.458384+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('115af05e-9ade-4e20-88c2-e477534551b3', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '447218115', NULL, 'ASSIGNED', NULL, NULL, 'd39b2b0f-80a7-44bd-93a1-a611baf470fd', '2026-07-26 10:52:29.130849+00', '2026-07-21 12:22:46.458384+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('e2bb7866-895e-4d71-83c5-ada583817a25', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '923992071', NULL, 'ASSIGNED', NULL, NULL, 'd39b2b0f-80a7-44bd-93a1-a611baf470fd', '2026-07-26 10:52:29.130849+00', '2026-07-21 12:22:46.458384+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('f2576d7c-aa70-4db3-a559-4c1a5e43719b', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '835369160', NULL, 'AVAILABLE', NULL, NULL, NULL, NULL, '2026-07-21 12:22:46.458384+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('10594257-8a96-4564-89c4-6826c29501f6', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '936291760', NULL, 'AVAILABLE', NULL, NULL, NULL, NULL, '2026-07-21 12:22:46.458384+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('2d6bd9f5-27b4-4d2f-baf3-6267dc269d4f', '9cfea196-ce3d-4843-8d5c-df310bfa0e07', '9534b2cd-a133-4629-9056-8eb5043bf354', '06209262', NULL, 'AVAILABLE', NULL, NULL, NULL, NULL, '2026-07-24 12:06:45.522559+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('08fe524d-7f66-493f-92dd-e83cd70423b4', '9cfea196-ce3d-4843-8d5c-df310bfa0e07', '9534b2cd-a133-4629-9056-8eb5043bf354', '58109067', NULL, 'AVAILABLE', NULL, NULL, NULL, NULL, '2026-07-24 12:06:45.522559+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('e343dffe-7b6d-4a6f-a72e-140e43cad6ea', '9cfea196-ce3d-4843-8d5c-df310bfa0e07', '9534b2cd-a133-4629-9056-8eb5043bf354', '14673085', NULL, 'AVAILABLE', NULL, NULL, NULL, NULL, '2026-07-24 12:06:45.522559+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('b2a1ef28-74bc-41a8-af9f-3a1c55e3a023', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '209263121', NULL, 'ASSIGNED', NULL, NULL, 'd39b2b0f-80a7-44bd-93a1-a611baf470fd', '2026-07-26 10:52:29.130849+00', '2026-07-21 12:22:46.458384+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('7f5b04b9-8b49-49fa-b261-4ff0b6a07663', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '410427588', NULL, 'AVAILABLE', NULL, NULL, NULL, NULL, '2026-07-21 12:22:46.458384+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('bfcfcf63-4b54-439b-ab15-59354ccb44a5', '9cfea196-ce3d-4843-8d5c-df310bfa0e07', '9534b2cd-a133-4629-9056-8eb5043bf354', '47826550', NULL, 'SOLD', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', '2026-07-24 13:00:37.906252+00', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', '2026-07-24 12:57:59.686627+00', '2026-07-24 12:06:45.522559+00');
INSERT INTO "public"."cards" ("id", "package_id", "network_id", "username", "password", "status", "sold_to", "sold_at", "assigned_to", "assigned_at", "created_at") VALUES ('8c5bbc84-fd21-4dee-a280-6ee3589b8b46', '9cfea196-ce3d-4843-8d5c-df310bfa0e07', '9534b2cd-a133-4629-9056-8eb5043bf354', '48407582', NULL, 'SOLD', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', '2026-07-24 13:00:38.039401+00', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', '2026-07-24 12:57:59.686627+00', '2026-07-24 12:06:45.522559+00');


--
-- Data for Name: join_requests; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO "public"."join_requests" ("id", "network_id", "agent_id", "agent_username", "agent_full_name", "agent_phone", "status", "reject_reason", "requested_at", "decided_at", "decided_by") VALUES ('b255f80b-cff3-4313-a9f7-15ea56166a71', '4664887b-9955-40c1-be8d-d2a934d2c942', 'd39b2b0f-80a7-44bd-93a1-a611baf470fd', 'u775649620', 'باسم عبدالعليم عبدالرب حسن', '775649620', 'APPROVED', NULL, '2026-07-21 12:32:16.573098+00', '2026-07-21 12:34:17.595968+00', 'de380cef-b6f1-4070-80d4-096d1b1f4c76');
INSERT INTO "public"."join_requests" ("id", "network_id", "agent_id", "agent_username", "agent_full_name", "agent_phone", "status", "reject_reason", "requested_at", "decided_at", "decided_by") VALUES ('29b57c2a-f955-4ed4-9f15-15b37ce7be5a', '4664887b-9955-40c1-be8d-d2a934d2c942', '025e2f6e-9e49-44e3-9b3c-9a7b75330d9d', 'u777020155', 'ماجد حميد احمد الحائط', '777020155', 'APPROVED', NULL, '2026-07-21 13:24:25.090594+00', '2026-07-21 13:25:22.578534+00', 'de380cef-b6f1-4070-80d4-096d1b1f4c76');
INSERT INTO "public"."join_requests" ("id", "network_id", "agent_id", "agent_username", "agent_full_name", "agent_phone", "status", "reject_reason", "requested_at", "decided_at", "decided_by") VALUES ('4d87aa96-c37e-4291-9721-780be56d8b42', '4664887b-9955-40c1-be8d-d2a934d2c942', 'c22e26ca-03bd-419a-8f40-89a3ae772247', 'u778492885', 'مفيد صالح علي الزري', '778492885', 'APPROVED', NULL, '2026-07-21 13:49:37.322972+00', '2026-07-21 13:50:16.534283+00', 'de380cef-b6f1-4070-80d4-096d1b1f4c76');
INSERT INTO "public"."join_requests" ("id", "network_id", "agent_id", "agent_username", "agent_full_name", "agent_phone", "status", "reject_reason", "requested_at", "decided_at", "decided_by") VALUES ('63d7a538-f692-4ba6-97a3-c8b0edf82ffe', '4664887b-9955-40c1-be8d-d2a934d2c942', 'e608fa82-347a-4ed2-b838-33af5a4fde4a', 'u774818215', 'ماجد بن يحيى الضيعاني', '774818215', 'APPROVED', NULL, '2026-07-21 14:18:10.111754+00', '2026-07-21 14:28:40.49207+00', 'de380cef-b6f1-4070-80d4-096d1b1f4c76');
INSERT INTO "public"."join_requests" ("id", "network_id", "agent_id", "agent_username", "agent_full_name", "agent_phone", "status", "reject_reason", "requested_at", "decided_at", "decided_by") VALUES ('99cd7bc7-7f73-4640-956f-14d587f06b50', '9534b2cd-a133-4629-9056-8eb5043bf354', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', 'u778492883', 'مفيد الزري', '778492883', 'APPROVED', NULL, '2026-07-24 12:07:04.471258+00', '2026-07-24 12:07:18.635031+00', 'bb568927-a332-4fe5-a636-a4dd67cc4e57');
INSERT INTO "public"."join_requests" ("id", "network_id", "agent_id", "agent_username", "agent_full_name", "agent_phone", "status", "reject_reason", "requested_at", "decided_at", "decided_by") VALUES ('9d9dd663-24be-4596-aab6-a77f138494ba', '9534b2cd-a133-4629-9056-8eb5043bf354', '115cc622-7b6e-4324-a75f-91d14cf2c053', 'u778561310', 'واثق علي محمد الصبيحي', '778561310', 'APPROVED', NULL, '2026-07-24 23:45:42.649919+00', '2026-07-24 23:46:46.474254+00', 'bb568927-a332-4fe5-a636-a4dd67cc4e57');


--
-- Data for Name: logs; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('e8693410-7ddd-4bd3-80f8-17d708193a4f', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'SUSPEND_NETWORK', 'network', '4664887b-9955-40c1-be8d-d2a934d2c942', '{"is_active": false}', '2026-07-26 02:08:31.661702+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('aba7004d-e273-4808-bb27-1d825e5496b1', 'd39b2b0f-80a7-44bd-93a1-a611baf470fd', 'u775649620', 'REQUEST_CARDS', 'card_request', 'ad9222cc-823b-42cc-a744-9655c5ff0cce', '{"package": "باقــــة شهري", "quantity": 10, "payment_method": "CREDIT"}', '2026-07-26 07:29:27.486444+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('ad9ed057-9899-480b-868e-7b5323b49d4c', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'UPLOAD_CARDS', 'package', 'ffa66325-9a33-465a-b612-066f11e34aaf', '{"errors": 0, "inserted": 50, "duplicates": 0}', '2026-07-20 13:15:14.643206+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('20cfccad-966d-4f96-92e1-3eeba5492be1', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'APPROVE_JOIN', 'join_request', '11124da9-f460-4d18-bdf4-390dbec5d1ba', '{"agent": "u770015388", "network_id": "4664887b-9955-40c1-be8d-d2a934d2c942"}', '2026-07-20 13:17:03.662993+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('4bc4ea27-105b-4421-9f98-c726b2dd94ac', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'APPROVE_REQUEST', 'card_request', 'f21a9f0f-4f84-4f7d-9b85-c9976c8329cc', '{"agent": "u770015388", "package": "باقه شهريه", "approved": 10, "requested": 10}', '2026-07-20 13:21:48.857934+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('6d6e0845-10ba-43ea-a863-56cde480d7c3', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'APPROVE_JOIN', 'join_request', 'd8053c53-dfc1-438d-88da-d945d68a0d7f', '{"agent": "u772622028", "network_id": "4664887b-9955-40c1-be8d-d2a934d2c942"}', '2026-07-21 02:47:27.946002+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('ae110240-b2ca-4ecd-9698-f755d99263c3', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'APPROVE_REQUEST', 'card_request', '1d7c0e36-8be0-4e39-9ad0-c29f70cb7afc', '{"agent": "u772622028", "package": "باقه شهريه", "approved": 10, "requested": 10}', '2026-07-21 02:48:05.370376+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('ffeded08-73ec-45cf-be25-207aab582b94', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'WIPE_NETWORK_DATA', 'network', '4664887b-9955-40c1-be8d-d2a934d2c942', '{"logs": 6, "cards": 50, "sales": 4, "packages": 1, "card_requests": 2, "join_requests": 2, "agents_deleted": 2, "request_payments": 0}', '2026-07-21 12:16:47.086075+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('3b7b560f-555f-4241-98db-27482d49b939', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'UPLOAD_CARDS', 'package', 'b0240155-ef23-401e-9c72-c28800ac06ce', '{"errors": 0, "inserted": 50, "duplicates": 0}', '2026-07-21 12:22:46.458384+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('b0e17041-50df-466a-9148-505684f7be6d', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'APPROVE_JOIN', 'join_request', 'b255f80b-cff3-4313-a9f7-15ea56166a71', '{"agent": "u775649620", "network_id": "4664887b-9955-40c1-be8d-d2a934d2c942"}', '2026-07-21 12:34:17.595968+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('91f207d3-8aaf-48aa-b396-f606f11baf15', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'APPROVE_JOIN', 'join_request', '29b57c2a-f955-4ed4-9f15-15b37ce7be5a', '{"agent": "u777020155", "network_id": "4664887b-9955-40c1-be8d-d2a934d2c942"}', '2026-07-21 13:25:22.578534+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('aa9f248d-95bd-4480-8724-10da6432c421', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'APPROVE_REQUEST', 'card_request', '9ffba834-2a46-4fd2-81d3-fd430bc03171', '{"agent": "u777020155", "package": "باقــــة شهري", "approved": 10, "requested": 10}', '2026-07-21 13:32:27.553711+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('b2df1e67-460e-4533-8ddc-f7b1a23aeb88', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'APPROVE_JOIN', 'join_request', '4d87aa96-c37e-4291-9721-780be56d8b42', '{"agent": "u778492885", "network_id": "4664887b-9955-40c1-be8d-d2a934d2c942"}', '2026-07-21 13:50:16.534283+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('0b78930d-0e4f-4b43-a618-a4b761a70aae', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'APPROVE_REQUEST', 'card_request', 'a299e0d3-2c3c-4351-83a7-00501310d570', '{"agent": "u778492885", "package": "باقــــة شهري", "approved": 1, "requested": 1}', '2026-07-21 13:52:08.838778+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('54ea6ac6-3f3c-483d-ba6f-b4cab117d071', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'APPROVE_JOIN', 'join_request', '63d7a538-f692-4ba6-97a3-c8b0edf82ffe', '{"agent": "u774818215", "network_id": "4664887b-9955-40c1-be8d-d2a934d2c942"}', '2026-07-21 14:28:40.49207+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('8be5ae23-8723-4cf1-91ab-15fc5c4805b2', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'APPROVE_REQUEST', 'card_request', '12590826-4d0a-467e-b5ef-0302a7c2dcd4', '{"agent": "u774818215", "package": "باقــــة شهري", "approved": 10, "requested": 10}', '2026-07-21 14:32:58.331598+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('b60ec4a8-fa47-4799-b7c5-b1f8b7c876c6', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'APPROVE_REQUEST', 'card_request', '31a3ce6c-1cad-4d06-89e5-f9d1c5a9b266', '{"agent": "u778492885", "package": "باقــــة شهري", "approved": 1, "requested": 1}', '2026-07-22 00:15:15.834177+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('024bcd8a-031b-4534-bdde-d83c86e4c07c', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'BULK_DELETE_CARDS', 'cards', NULL, '{"force": true, "deleted": 1, "network_id": "4664887b-9955-40c1-be8d-d2a934d2c942", "skipped_sold": 0}', '2026-07-22 01:29:35.229399+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('9fed18cc-16f6-43fe-ac69-296e8c0a7dd7', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'UPLOAD_CARDS', 'package', '63902092-34e5-44cb-923d-7baba8802f7e', '{"errors": 0, "inserted": 3, "duplicates": 0}', '2026-07-22 01:48:10.773216+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('9589a4f0-3db9-4847-9985-076ce9ea359e', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'APPROVE_REQUEST', 'card_request', 'cf2392ea-9777-4839-9794-3e9328d91433', '{"agent": "u778492885", "package": "باقــــة 8ساعات", "approved": 2, "requested": 2}', '2026-07-22 01:49:57.773789+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('ccceea03-440d-445c-bb1a-9afb232d1a43', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'BULK_DELETE_CARDS', 'cards', NULL, '{"force": true, "deleted": 3, "network_id": "4664887b-9955-40c1-be8d-d2a934d2c942", "skipped_sold": 0}', '2026-07-22 01:57:31.487092+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('d82114ec-e0e8-47ad-8c29-5e6467f6944f', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'APPROVE_REQUEST', 'card_request', '81c24397-1063-45d8-ae5c-85e96914b179', '{"agent": "u778492885", "package": "باقــــة 8ساعات", "approved": 1, "requested": 1}', '2026-07-22 01:59:03.802895+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('8ce7a41d-67c3-4ec4-b58b-4ed05c9e39c8', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'BULK_DELETE_CARDS', 'cards', NULL, '{"force": false, "deleted": 1, "network_id": "4664887b-9955-40c1-be8d-d2a934d2c942", "skipped_sold": 0}', '2026-07-22 02:00:49.553841+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('db73dd75-fb9e-48bf-b43c-708975ac3ff2', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'UPLOAD_CARDS', 'package', '63902092-34e5-44cb-923d-7baba8802f7e', '{"errors": 0, "inserted": 3, "duplicates": 1}', '2026-07-22 02:06:17.652752+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('1c52311e-eacf-4451-80db-85ca821c0e25', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'APPROVE_REQUEST', 'card_request', 'bce65cec-64f8-4ee0-ab32-a84611ca8c6d', '{"agent": "u778492885", "package": "باقــــة 8ساعات", "approved": 3, "requested": 3}', '2026-07-22 02:08:11.98751+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('a07a711f-ff7f-4a0b-8fee-5826b1e916a1', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'UNASSIGN_CARDS', 'cards', NULL, '{"network_id": "4664887b-9955-40c1-be8d-d2a934d2c942", "unassigned": 3}', '2026-07-22 02:10:02.309751+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('fe5960b7-9a43-4507-be56-a4caafd479b1', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'APPROVE_REQUEST', 'card_request', 'b733a604-543e-4ce6-aa63-d6f3248243c8', '{"agent": "u778492885", "package": "باقــــة 8ساعات", "approved": 1, "requested": 1}', '2026-07-22 02:11:24.680621+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('0920a38c-a1e7-4c1a-a941-38450daf6d81', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', 'u778492884', 'SETTLE_AGENT_DEBT', 'profile', 'c22e26ca-03bd-419a-8f40-89a3ae772247', '{"note": null, "amount": 74, "applied": 74.00, "remaining_debt": 0.00}', '2026-07-22 02:29:22.145368+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('8c000013-bdb0-4924-8dd7-cf21e79baa21', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', 'u778492884', 'SETTLE_AGENT_DEBT', 'profile', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', '{"note": null, "amount": 50, "applied": 0, "remaining_debt": 0}', '2026-07-22 03:13:55.008266+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('613ce59d-8e24-4a67-9e91-c9963a4cd138', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'REJECT_REQUEST', 'card_request', 'a0107e59-9882-485c-b46a-9c7b9ddc5ddf', '{"agent": "u778492885", "reason": "لم تحاسب", "package": "باقــــة شهري"}', '2026-07-22 03:30:55.0268+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('c1b53833-2d0a-4d8f-8490-a965e0c30568', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'REJECT_REQUEST', 'card_request', '35e86054-773d-4cd8-a6a7-5ce13864eb4b', '{"agent": "u778492885", "reason": "حاسبني", "package": "باقــــة شهري"}', '2026-07-22 11:11:32.201267+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('e9daa612-5193-4247-a62f-e60c36c7581c', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', 'u778492884', 'SETTLE_AGENT_DEBT', 'profile', 'c22e26ca-03bd-419a-8f40-89a3ae772247', '{"note": null, "amount": 74, "applied": 0, "remaining_debt": 0.00}', '2026-07-22 11:14:13.032276+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('a10c5be2-3b1d-4231-8af5-834463e1a537', 'd39b2b0f-80a7-44bd-93a1-a611baf470fd', 'u775649620', 'REQUEST_CARDS', 'card_request', '8abf1d53-5490-4dbe-b576-69859e9f1900', '{"package": "باقــــة شهري", "quantity": 10, "payment_method": "CREDIT"}', '2026-07-26 10:46:19.995097+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('daefaa64-220c-4848-81a7-6abb4e99d917', 'cf7a1ea4-c73e-4da8-a3a3-33e59bfe02cd', NULL, 'APPROVE_REQUEST', 'card_request', '8abf1d53-5490-4dbe-b576-69859e9f1900', '{"agent": "u775649620", "package": "باقــــة شهري", "approved": 10, "requested": 10}', '2026-07-26 10:52:29.130849+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('1dda5cf2-79e7-4503-82df-6d59883acfa3', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'APPROVE_REQUEST', 'card_request', '93674192-011b-46a5-8218-6c45d786fb0d', '{"agent": "u778492885", "package": "باقــــة شهري", "approved": 1, "requested": 1}', '2026-07-22 12:34:18.703463+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('e2d40d00-e9a0-4a31-90f3-800d7e3af27d', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', 'u778492884', 'SETTLE_AGENT_DEBT', 'profile', 'c22e26ca-03bd-419a-8f40-89a3ae772247', '{"note": "تم تسديت ", "amount": 30, "applied": 30, "remaining_debt": 0.00}', '2026-07-22 12:36:06.871985+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('8b06db3b-e528-4fc0-9320-a2c3083e7e65', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'APPROVE_REQUEST', 'card_request', '5d673fe0-dc45-4c84-b83e-fed961d41622', '{"agent": "u778492885", "package": "باقــــة شهري", "approved": 1, "requested": 1}', '2026-07-22 12:44:44.141521+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('3cacacb6-dc7f-4262-a72f-c5a1f598b9c9', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'UPLOAD_CARDS', 'package', '63902092-34e5-44cb-923d-7baba8802f7e', '{"errors": 0, "inserted": 20, "duplicates": 0}', '2026-07-22 12:46:11.485743+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('d82cc863-7966-4055-9ef5-d37fc3ec2bb4', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'APPROVE_REQUEST', 'card_request', '598ee792-f55b-4d6d-9d18-7a873acfdb3e', '{"agent": "u778492885", "package": "باقــــة 8ساعات", "approved": 10, "requested": 10}', '2026-07-22 12:46:41.795783+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('9eed4cd8-ca63-42d5-af05-1d2a426861bf', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', 'u778492884', 'SETTLE_AGENT_DEBT', 'profile', 'c22e26ca-03bd-419a-8f40-89a3ae772247', '{"note": null, "amount": 50, "applied": 50.00, "remaining_debt": 0.00}', '2026-07-22 12:48:04.023872+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('c8cba275-bbef-4f67-a3a5-9fbbb51eb924', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'UNASSIGN_CARDS', 'cards', NULL, '{"network_id": "4664887b-9955-40c1-be8d-d2a934d2c942", "unassigned": 5}', '2026-07-22 17:20:44.902927+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('dcf993a9-40d5-49e7-839a-3e8d72aaad5c', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'ACTIVATE_NETWORK', 'network', '4664887b-9955-40c1-be8d-d2a934d2c942', '{"is_active": true}', '2026-07-26 11:40:35.902779+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('021c9777-1c08-47fc-8adc-22dc59e6a79c', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'APPROVE_REQUEST', 'card_request', 'f4694e46-ce52-4091-8e90-5bc650ba41b1', '{"agent": "u775649620", "package": "باقــــة شهري", "approved": 10, "requested": 10}', '2026-07-23 17:59:51.680238+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('a12b16ed-8d63-4554-ac8b-bbc32eb8c835', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'UNASSIGN_CARDS', 'cards', NULL, '{"network_id": "4664887b-9955-40c1-be8d-d2a934d2c942", "unassigned": 10}', '2026-07-23 18:00:23.534505+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('e21d5f84-0050-4c2c-abbf-ac285b875ac9', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'UNASSIGN_CARDS', 'cards', NULL, '{"network_id": "4664887b-9955-40c1-be8d-d2a934d2c942", "unassigned": 0}', '2026-07-23 18:00:23.53976+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('aff51169-29ce-4049-8a15-7ea34cca07d8', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'APPROVE_REQUEST', 'card_request', '9ea0df97-ee33-4385-878b-03718e99fb7a', '{"agent": "u778492885", "package": "باقــــة شهري", "approved": 10, "requested": 10}', '2026-07-24 11:49:15.980167+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('c7cefb54-3bb5-4013-b4be-0dcfe38cc302', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', 'u778492884', 'SETTLE_AGENT_DEBT', 'profile', 'c22e26ca-03bd-419a-8f40-89a3ae772247', '{"note": null, "amount": 150, "applied": 150, "remaining_debt": 150.00}', '2026-07-24 11:50:48.034426+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('400a8d2a-dd82-46d1-8435-86e22d58178e', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'UNASSIGN_CARDS', 'cards', NULL, '{"network_id": "4664887b-9955-40c1-be8d-d2a934d2c942", "unassigned": 7}', '2026-07-24 11:51:53.429745+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('b63a96e4-7e3d-4031-b314-f1459c68b44e', 'bb568927-a332-4fe5-a636-a4dd67cc4e57', NULL, 'UPLOAD_CARDS', 'package', '9cfea196-ce3d-4843-8d5c-df310bfa0e07', '{"errors": 0, "inserted": 20, "duplicates": 0}', '2026-07-24 12:06:45.522559+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('b45df7df-b09b-49d8-8e51-7ef851bf0b51', 'bb568927-a332-4fe5-a636-a4dd67cc4e57', NULL, 'APPROVE_JOIN', 'join_request', '99cd7bc7-7f73-4640-956f-14d587f06b50', '{"agent": "u778492883", "network_id": "9534b2cd-a133-4629-9056-8eb5043bf354"}', '2026-07-24 12:07:18.635031+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('d3e5d739-daa4-4f2f-ae9f-18ca509a6db3', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', 'u778492883', 'REQUEST_CARDS', 'card_request', '3d540bdd-cc6e-4b19-8e3f-6d22265986ec', '{"package": "شهريه", "quantity": 10, "payment_method": "CREDIT"}', '2026-07-24 12:07:40.143579+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('f94df5b2-a736-43b7-a690-46e3f25506f7', 'bb568927-a332-4fe5-a636-a4dd67cc4e57', NULL, 'APPROVE_REQUEST', 'card_request', '3d540bdd-cc6e-4b19-8e3f-6d22265986ec', '{"agent": "u778492883", "package": "شهريه", "approved": 10, "requested": 10}', '2026-07-24 12:07:46.719823+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('e240844f-b46f-4323-bc10-d9c1f8544a45', 'bb568927-a332-4fe5-a636-a4dd67cc4e57', NULL, 'UPLOAD_CARDS', 'package', '9cfea196-ce3d-4843-8d5c-df310bfa0e07', '{"errors": 0, "inserted": 0, "duplicates": 20}', '2026-07-24 12:08:15.533353+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('125299f2-c401-45bb-984b-ccb72738f055', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', 'u778492883', 'SELL_CARD', 'sale', '27e85648-b6c5-4c53-893d-8fa1d6c0b23b', '{"price": 30.00, "network": "الواثق نت الفضائية", "package": "شهريه"}', '2026-07-24 12:08:59.054207+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('cf93a255-27cf-4c2f-863c-b7ba47da9551', 'bb568927-a332-4fe5-a636-a4dd67cc4e57', NULL, 'UNASSIGN_CARDS', 'cards', NULL, '{"network_id": "9534b2cd-a133-4629-9056-8eb5043bf354", "unassigned": 9}', '2026-07-24 12:09:44.600977+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('8e29e747-87f4-488f-8b0c-221d16132783', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', 'u778492884', 'SETTLE_AGENT_DEBT', 'profile', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', '{"note": null, "amount": 100, "applied": 0, "remaining_debt": 0}', '2026-07-24 12:44:44.414846+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('dbd0cb42-150d-4b64-a86b-279331ac6e37', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'APPROVE_REQUEST', 'card_request', '9dfeeaad-dba0-46ea-a6aa-cd973228ce38', '{"agent": "u778492885", "package": "باقــــة شهري", "approved": 10, "requested": 10}', '2026-07-24 12:54:18.80135+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('8e41d25d-6ee4-411b-b8c1-c34cb017f3a9', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', 'u778492883', 'REQUEST_CARDS', 'card_request', '1b14ab74-8139-4dbe-97a1-dc381c27d322', '{"package": "شهريه", "quantity": 10, "payment_method": "CREDIT"}', '2026-07-24 12:57:14.597946+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('34fd4867-1af5-4117-9c04-8895fe6c4d69', 'bb568927-a332-4fe5-a636-a4dd67cc4e57', NULL, 'APPROVE_REQUEST', 'card_request', '1b14ab74-8139-4dbe-97a1-dc381c27d322', '{"agent": "u778492883", "package": "شهريه", "approved": 10, "requested": 10}', '2026-07-24 12:57:59.686627+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('bf052bcb-1d37-4f67-8b83-1e0b494144fc', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', 'u778492883', 'SELL_CARD', 'sale', '8b0d8f08-d374-4eac-a3c3-73a9fe52abcb', '{"price": 30.00, "network": "الواثق نت الفضائية", "package": "شهريه"}', '2026-07-24 13:00:36.558412+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('0da02d69-615d-4676-b46b-90ed70f02aa9', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', 'u778492883', 'SELL_CARD', 'sale', 'd53193f5-3049-48af-86b3-7c0286559d54', '{"price": 30.00, "network": "الواثق نت الفضائية", "package": "شهريه"}', '2026-07-24 13:00:37.090126+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('919089e9-8a4d-44b3-bf3a-b7f2f595dafb', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', 'u778492883', 'SELL_CARD', 'sale', '4a18457a-8db3-4614-a3fa-d0894bc0f42e', '{"price": 30.00, "network": "الواثق نت الفضائية", "package": "شهريه"}', '2026-07-24 13:00:37.213167+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('06d4d548-4255-4544-b43b-824577b42fd7', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', 'u778492883', 'SELL_CARD', 'sale', '9b6f10cf-4ddf-4f45-81c6-b4f6fc62672a', '{"price": 30.00, "network": "الواثق نت الفضائية", "package": "شهريه"}', '2026-07-24 13:00:37.328956+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('0ff0f308-8bc6-4760-a141-3e663d7b0e4a', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', 'u778492883', 'SELL_CARD', 'sale', 'af36d697-342a-4f5c-ac21-348ed87ec521', '{"price": 30.00, "network": "الواثق نت الفضائية", "package": "شهريه"}', '2026-07-24 13:00:37.459677+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('be60e25f-6ab5-42ed-af5c-c944e2155f50', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', 'u778492883', 'SELL_CARD', 'sale', 'ca52d6a2-e505-4903-882c-44199f4f3776', '{"price": 30.00, "network": "الواثق نت الفضائية", "package": "شهريه"}', '2026-07-24 13:00:37.906252+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('3fb87f50-0ac7-4f4c-916a-ac3e8665097b', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', 'u778492883', 'SELL_CARD', 'sale', '41465652-a45f-4501-a69d-d9e6ad0f4cd4', '{"price": 30.00, "network": "الواثق نت الفضائية", "package": "شهريه"}', '2026-07-24 13:00:38.039401+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('2a1d0481-1b05-43a9-a9cb-d48c4dc2304a', 'd39b2b0f-80a7-44bd-93a1-a611baf470fd', 'u775649620', 'SELL_CARD', 'sale', '69e7e056-b6f1-4a60-b03e-25e51005206d', '{"price": 30.00, "network": "الزري نت اللاسلكية", "package": "باقــــة شهري"}', '2026-07-26 11:40:41.668406+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('0faed9fa-ed65-41a8-b491-840dc7d55481', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', 'u778492883', 'SELL_CARD', 'sale', '7ef67f5b-d748-4be7-8faa-05d09475e891', '{"price": 30.00, "network": "الواثق نت الفضائية", "package": "شهريه"}', '2026-07-24 13:00:37.590641+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('947c8ae8-9ee1-400f-acdd-2ec79b3a9491', 'cf7a1ea4-c73e-4da8-a3a3-33e59bfe02cd', NULL, 'REJECT_REQUEST', 'card_request', 'ad9222cc-823b-42cc-a744-9655c5ff0cce', '{"agent": "u775649620", "reason": "هذا الطلب مكرى", "package": "باقــــة شهري"}', '2026-07-26 11:41:59.310717+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('02990814-61d6-42e2-8088-785922ac3169', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', 'u778492883', 'SELL_CARD', 'sale', '40d0ba55-d836-4526-8740-e4722eabc18a', '{"price": 30.00, "network": "الواثق نت الفضائية", "package": "شهريه"}', '2026-07-24 13:00:37.694785+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('81d48f7c-2bca-4e0a-83f0-f27162b36e2c', 'cf7a1ea4-c73e-4da8-a3a3-33e59bfe02cd', NULL, 'REJECT_REQUEST', 'card_request', 'cb806d5b-66ec-461d-a9ec-d245c0d6c82c', '{"agent": "u778492885", "reason": "مكرر", "package": "باقــــة شهري"}', '2026-07-26 11:42:08.434742+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('bdddfed3-0d2e-45dc-9efc-8b34a4095527', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', 'u778492883', 'SELL_CARD', 'sale', '9901835d-8ef8-4594-a1ab-58826ae4e6fe', '{"price": 30.00, "network": "الواثق نت الفضائية", "package": "شهريه"}', '2026-07-24 13:00:37.804172+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('0f133b8c-9f3c-4e18-b525-2ef5b5453144', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'UNASSIGN_CARDS', 'cards', NULL, '{"network_id": "4664887b-9955-40c1-be8d-d2a934d2c942", "unassigned": 10}', '2026-07-24 18:04:34.547261+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('b85dc30a-c539-4154-be46-88b1218d28b8', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'APPROVE_REQUEST', 'card_request', '39a4da78-2bda-4573-8cdb-d32bb1ccaa53', '{"agent": "u778492885", "package": "باقــــة شهري", "approved": 10, "requested": 10}', '2026-07-24 18:05:47.567124+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('404741fd-3999-4d3e-94b7-656429523500', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', 'u778492884', 'SETTLE_AGENT_DEBT', 'profile', 'c22e26ca-03bd-419a-8f40-89a3ae772247', '{"note": null, "amount": 300, "applied": 300, "remaining_debt": 0.00}', '2026-07-24 18:09:20.246184+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('2a96107f-5019-4b10-945a-e70643675fd1', 'bb568927-a332-4fe5-a636-a4dd67cc4e57', NULL, 'UPLOAD_CARDS', 'package', 'ff469612-9da6-4aec-b64b-0ac12762999a', '{"errors": 0, "inserted": 60, "duplicates": 0}', '2026-07-24 19:02:47.96127+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('92c0a97d-6d77-4ef3-9082-a2be6f53249c', 'bb568927-a332-4fe5-a636-a4dd67cc4e57', NULL, 'APPROVE_JOIN', 'join_request', '9d9dd663-24be-4596-aab6-a77f138494ba', '{"agent": "u778561310", "network_id": "9534b2cd-a133-4629-9056-8eb5043bf354"}', '2026-07-24 23:46:46.474254+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('4c524d99-596c-4ad5-b418-8f33ce5c98dc', '115cc622-7b6e-4324-a75f-91d14cf2c053', 'u778561310', 'REQUEST_CARDS', 'card_request', '9de5eba5-f090-4286-844b-0f486465f60b', '{"package": "شهريه", "quantity": 6, "payment_method": "CREDIT"}', '2026-07-24 23:48:22.859137+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('d2586e0f-6272-4ad1-ae41-86b1a882b257', 'bb568927-a332-4fe5-a636-a4dd67cc4e57', NULL, 'APPROVE_REQUEST', 'card_request', '9de5eba5-f090-4286-844b-0f486465f60b', '{"agent": "u778561310", "package": "شهريه", "approved": 6, "requested": 6}', '2026-07-24 23:49:35.578343+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('cf9aa1a0-c33f-4377-a565-8360afc83b06', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'BULK_DELETE_CARDS', 'cards', NULL, '{"force": true, "deleted": 15, "network_id": "4664887b-9955-40c1-be8d-d2a934d2c942", "skipped_sold": 0}', '2026-07-25 23:27:41.690907+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('a0b4e1ab-b7fb-44e1-8139-2e1e697051b9', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'UPLOAD_CARDS', 'package', 'b0240155-ef23-401e-9c72-c28800ac06ce', '{"errors": 0, "inserted": 12, "duplicates": 0}', '2026-07-25 23:27:53.868303+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('474cde93-8d7c-4542-ba54-73b7b4dc3cd1', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'SUSPEND_NETWORK', 'network', 'b281d651-c274-4641-9ad5-285b49b1e435', '{"is_active": false}', '2026-07-26 01:01:57.399661+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('b81b24f1-d56b-4a04-9143-b7a0d7583a19', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'CREATE_PACKAGE', 'package', 'f208419f-a648-4b44-862f-70b726bc2ce7', '{"name": "يومي", "price": 50, "network_id": "b281d651-c274-4641-9ad5-285b49b1e435"}', '2026-07-26 01:05:17.499842+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('c63c1f9e-f478-4d62-b4db-2be93cb82c6f', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'ACTIVATE_NETWORK', 'network', 'b281d651-c274-4641-9ad5-285b49b1e435', '{"is_active": true}', '2026-07-26 01:08:21.610562+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('ef529bf6-2b38-4079-8638-fcddbf4a2e00', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'SUSPEND_NETWORK', 'network', 'b281d651-c274-4641-9ad5-285b49b1e435', '{"is_active": false}', '2026-07-26 01:25:58.412992+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('fb205768-27d1-45f2-bfa0-604fed520f62', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'SUPERADMIN_DELETE_NETWORK', 'network', 'b281d651-c274-4641-9ad5-285b49b1e435', '{"logs": 0, "cards": 0, "sales": 0, "packages": 0, "card_requests": 0, "join_requests": 0, "agents_deleted": 0, "network_deleted": 1, "request_payments": 0}', '2026-07-26 01:26:31.238381+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('16514a08-8275-4819-8a82-2a285c27d9bb', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'SUPERADMIN_DELETE_NETWORK', 'network', '0c46df03-bac7-4905-abc1-d5cf2093b67d', '{"logs": 15, "cards": 20, "sales": 10, "packages": 1, "card_requests": 1, "join_requests": 1, "agents_deleted": 2, "network_deleted": 1, "request_payments": 0}', '2026-07-26 01:41:34.282096+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('b29edc2b-5e19-49a0-81a7-5d9dd7456526', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'SUPERADMIN_DELETE_NETWORK', 'network', 'eda65c6d-cad0-406d-8020-d58097963f0b', '{"logs": 12, "cards": 0, "sales": 0, "packages": 0, "card_requests": 0, "join_requests": 0, "agents_deleted": 1, "network_deleted": 1, "request_payments": 0}', '2026-07-26 01:51:00.454586+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('26eb0b71-1294-4ea6-8ade-935906348e57', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'SUPERADMIN_DELETE_NETWORK', 'network', 'd2dd5193-1447-4133-8d9f-44e8a870d4e8', '{"logs": 5, "cards": 0, "sales": 0, "packages": 0, "card_requests": 0, "join_requests": 0, "agents_deleted": 1, "network_deleted": 1, "request_payments": 0}', '2026-07-26 01:51:08.104597+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('757c33a4-a30c-41a8-8439-597c9435ad27', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'SUPERADMIN_DELETE_NETWORK', 'network', '5c52cf23-1dc6-4aba-8bac-addad773f670', '{"logs": 1, "cards": 0, "sales": 0, "packages": 0, "card_requests": 0, "join_requests": 0, "agents_deleted": 1, "network_deleted": 1, "request_payments": 0}', '2026-07-26 01:51:20.483046+00');
INSERT INTO "public"."logs" ("id", "user_id", "actor_username", "action", "entity", "entity_id", "metadata", "created_at") VALUES ('fac9209e-e99e-46cc-802f-e415d879edfe', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', NULL, 'SUPERADMIN_DELETE_NETWORK', 'network', 'bb200ed1-eeae-441c-9389-2ef0c39ab722', '{"logs": 4, "cards": 0, "sales": 0, "packages": 0, "card_requests": 0, "join_requests": 0, "agents_deleted": 1, "network_deleted": 1, "request_payments": 0}', '2026-07-26 01:51:28.477597+00');


--
-- Data for Name: networks; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO "public"."networks" ("id", "name", "description", "currency", "primary_color", "secondary_color", "logo_url", "cover_url", "is_active", "created_by", "created_at", "updated_at", "owner_id") VALUES ('4664887b-9955-40c1-be8d-d2a934d2c942', 'الزري نت اللاسلكية', '', 'ر.س', '#ff0000', '#14B8A6', NULL, NULL, true, 'cf7a1ea4-c73e-4da8-a3a3-33e59bfe02cd', '2026-07-20 13:00:15.984871+00', '2026-07-26 11:40:35.902779+00', 'cf7a1ea4-c73e-4da8-a3a3-33e59bfe02cd');
INSERT INTO "public"."networks" ("id", "name", "description", "currency", "primary_color", "secondary_color", "logo_url", "cover_url", "is_active", "created_by", "created_at", "updated_at", "owner_id") VALUES ('9534b2cd-a133-4629-9056-8eb5043bf354', 'شبكه الاتحاد الفضائية', '', 'ر.س', '#009688', '#14B8A6', NULL, NULL, true, 'bb568927-a332-4fe5-a636-a4dd67cc4e57', '2026-07-24 12:03:48.936136+00', '2026-07-24 18:52:42.878116+00', 'bb568927-a332-4fe5-a636-a4dd67cc4e57');


--
-- Data for Name: packages; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO "public"."packages" ("id", "network_id", "name", "price", "data_size", "speed", "validity", "description", "color", "icon", "sort_order", "is_active", "created_at", "updated_at", "allowed_time") VALUES ('b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', 'باقــــة شهري', 30.00, 'بلا حدود', 'مفتوح', '30يوم', '', '#009688', 'wifi', 0, true, '2026-07-21 12:18:35.499312+00', '2026-07-22 01:46:24.663835+00', '720ساعه');
INSERT INTO "public"."packages" ("id", "network_id", "name", "price", "data_size", "speed", "validity", "description", "color", "icon", "sort_order", "is_active", "created_at", "updated_at", "allowed_time") VALUES ('9cfea196-ce3d-4843-8d5c-df310bfa0e07', '9534b2cd-a133-4629-9056-8eb5043bf354', 'شهريه', 30.00, 'بلا حدود', 'مفتوح', '30يوم', '', '#009688', 'wifi', 0, true, '2026-07-24 12:05:06.290448+00', '2026-07-24 18:54:23.425815+00', '720ساعه');


--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO "public"."profiles" ("id", "username", "full_name", "is_active", "created_at", "updated_at", "phone", "network_id") VALUES ('cf7a1ea4-c73e-4da8-a3a3-33e59bfe02cd', 'u778492884', 'مفيد صالح علي محمد الزري', true, '2026-07-26 00:37:55.383544+00', '2026-07-26 00:37:55.383544+00', '778492884', '4664887b-9955-40c1-be8d-d2a934d2c942');
INSERT INTO "public"."profiles" ("id", "username", "full_name", "is_active", "created_at", "updated_at", "phone", "network_id") VALUES ('d39b2b0f-80a7-44bd-93a1-a611baf470fd', 'u775649620', 'باسم عبدالعليم عبدالرب حسن', true, '2026-07-21 12:32:16.573098+00', '2026-07-21 12:34:17.595968+00', '775649620', '4664887b-9955-40c1-be8d-d2a934d2c942');
INSERT INTO "public"."profiles" ("id", "username", "full_name", "is_active", "created_at", "updated_at", "phone", "network_id") VALUES ('025e2f6e-9e49-44e3-9b3c-9a7b75330d9d', 'u777020155', 'ماجد حميد احمد الحائط', true, '2026-07-21 13:24:25.090594+00', '2026-07-21 13:25:22.578534+00', '777020155', '4664887b-9955-40c1-be8d-d2a934d2c942');
INSERT INTO "public"."profiles" ("id", "username", "full_name", "is_active", "created_at", "updated_at", "phone", "network_id") VALUES ('de380cef-b6f1-4070-80d4-096d1b1f4c76', 'u772622028', 'مفيد صالح علي الزري', true, '2026-07-20 13:00:15.984871+00', '2026-07-26 01:26:31.238381+00', '772622028', NULL);
INSERT INTO "public"."profiles" ("id", "username", "full_name", "is_active", "created_at", "updated_at", "phone", "network_id") VALUES ('bb568927-a332-4fe5-a636-a4dd67cc4e57', 'u777383916', 'واثق الصبيحي', true, '2026-07-24 12:03:48.936136+00', '2026-07-24 12:03:48.936136+00', '777383916', '9534b2cd-a133-4629-9056-8eb5043bf354');
INSERT INTO "public"."profiles" ("id", "username", "full_name", "is_active", "created_at", "updated_at", "phone", "network_id") VALUES ('e608fa82-347a-4ed2-b838-33af5a4fde4a', 'u774818215', 'ماجد بن يحيى الضيعاني', true, '2026-07-21 14:18:10.111754+00', '2026-07-22 13:05:40.955779+00', '774818215', '4664887b-9955-40c1-be8d-d2a934d2c942');
INSERT INTO "public"."profiles" ("id", "username", "full_name", "is_active", "created_at", "updated_at", "phone", "network_id") VALUES ('c22e26ca-03bd-419a-8f40-89a3ae772247', 'u778492885', 'مفيد صالح علي الزري', true, '2026-07-21 13:49:37.322972+00', '2026-07-24 18:08:11.753538+00', '778492885', '4664887b-9955-40c1-be8d-d2a934d2c942');
INSERT INTO "public"."profiles" ("id", "username", "full_name", "is_active", "created_at", "updated_at", "phone", "network_id") VALUES ('c87ef36a-0edb-4344-95aa-fa4be66a841e', 'u778492883', 'مفيد الزري', true, '2026-07-24 12:07:04.471258+00', '2026-07-24 19:08:47.173222+00', '778492883', '9534b2cd-a133-4629-9056-8eb5043bf354');
INSERT INTO "public"."profiles" ("id", "username", "full_name", "is_active", "created_at", "updated_at", "phone", "network_id") VALUES ('115cc622-7b6e-4324-a75f-91d14cf2c053', 'u778561310', 'واثق علي محمد الصبيحي', true, '2026-07-24 23:45:42.649919+00', '2026-07-24 23:46:46.474254+00', '778561310', '9534b2cd-a133-4629-9056-8eb5043bf354');


--
-- Data for Name: request_payments; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO "public"."request_payments" ("id", "request_id", "amount", "note", "recorded_by", "recorded_by_username", "created_at") VALUES ('6a6fadb7-4972-4b9c-bc83-ea6f28cd4de1', 'a299e0d3-2c3c-4351-83a7-00501310d570', 30.00, NULL, 'de380cef-b6f1-4070-80d4-096d1b1f4c76', 'u778492884', '2026-07-22 02:29:22.145368+00');
INSERT INTO "public"."request_payments" ("id", "request_id", "amount", "note", "recorded_by", "recorded_by_username", "created_at") VALUES ('61dee780-a2fc-483c-a138-be39dcd0119a', '31a3ce6c-1cad-4d06-89e5-f9d1c5a9b266', 30.00, NULL, 'de380cef-b6f1-4070-80d4-096d1b1f4c76', 'u778492884', '2026-07-22 02:29:22.145368+00');
INSERT INTO "public"."request_payments" ("id", "request_id", "amount", "note", "recorded_by", "recorded_by_username", "created_at") VALUES ('22da097f-ce7b-414c-838b-1fb4bdd948ae', '93674192-011b-46a5-8218-6c45d786fb0d', 30.00, 'تم تسديت', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', 'u778492884', '2026-07-22 12:36:06.871985+00');
INSERT INTO "public"."request_payments" ("id", "request_id", "amount", "note", "recorded_by", "recorded_by_username", "created_at") VALUES ('6f90beae-d248-4d7c-ae6b-c48bdb693e16', '5d673fe0-dc45-4c84-b83e-fed961d41622', 30.00, NULL, 'de380cef-b6f1-4070-80d4-096d1b1f4c76', 'u778492884', '2026-07-22 12:48:04.023872+00');
INSERT INTO "public"."request_payments" ("id", "request_id", "amount", "note", "recorded_by", "recorded_by_username", "created_at") VALUES ('3491af0d-2704-419a-bd03-2ca3c180242e', '9ea0df97-ee33-4385-878b-03718e99fb7a', 150.00, NULL, 'de380cef-b6f1-4070-80d4-096d1b1f4c76', 'u778492884', '2026-07-24 11:50:48.034426+00');
INSERT INTO "public"."request_payments" ("id", "request_id", "amount", "note", "recorded_by", "recorded_by_username", "created_at") VALUES ('4bda0f50-fd36-4fe3-a870-9d29058cf5c9', '39a4da78-2bda-4573-8cdb-d32bb1ccaa53', 300.00, NULL, 'de380cef-b6f1-4070-80d4-096d1b1f4c76', 'u778492884', '2026-07-24 18:09:20.246184+00');


--
-- Data for Name: sales; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO "public"."sales" ("id", "transaction_no", "card_id", "package_id", "network_id", "agent_id", "price", "package_name", "network_name", "agent_username", "sold_at") VALUES ('d53193f5-3049-48af-86b3-7c0286559d54', 'TX-20260724-21004', '00122cf3-ce1c-45a8-b460-97927e839e2e', '9cfea196-ce3d-4843-8d5c-df310bfa0e07', '9534b2cd-a133-4629-9056-8eb5043bf354', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', 30.00, 'شهريه', 'الواثق نت الفضائية', 'u778492883', '2026-07-24 13:00:37.090126+00');
INSERT INTO "public"."sales" ("id", "transaction_no", "card_id", "package_id", "network_id", "agent_id", "price", "package_name", "network_name", "agent_username", "sold_at") VALUES ('af36d697-342a-4f5c-ac21-348ed87ec521', 'TX-20260724-97080', '5e3fc8a6-db00-4205-900e-07736154d27f', '9cfea196-ce3d-4843-8d5c-df310bfa0e07', '9534b2cd-a133-4629-9056-8eb5043bf354', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', 30.00, 'شهريه', 'الواثق نت الفضائية', 'u778492883', '2026-07-24 13:00:37.459677+00');
INSERT INTO "public"."sales" ("id", "transaction_no", "card_id", "package_id", "network_id", "agent_id", "price", "package_name", "network_name", "agent_username", "sold_at") VALUES ('40d0ba55-d836-4526-8740-e4722eabc18a', 'TX-20260724-54561', 'c61587a5-bcca-4daf-931f-5a70e88c5516', '9cfea196-ce3d-4843-8d5c-df310bfa0e07', '9534b2cd-a133-4629-9056-8eb5043bf354', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', 30.00, 'شهريه', 'الواثق نت الفضائية', 'u778492883', '2026-07-24 13:00:37.694785+00');
INSERT INTO "public"."sales" ("id", "transaction_no", "card_id", "package_id", "network_id", "agent_id", "price", "package_name", "network_name", "agent_username", "sold_at") VALUES ('41465652-a45f-4501-a69d-d9e6ad0f4cd4', 'TX-20260724-99449', '8c5bbc84-fd21-4dee-a280-6ee3589b8b46', '9cfea196-ce3d-4843-8d5c-df310bfa0e07', '9534b2cd-a133-4629-9056-8eb5043bf354', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', 30.00, 'شهريه', 'الواثق نت الفضائية', 'u778492883', '2026-07-24 13:00:38.039401+00');
INSERT INTO "public"."sales" ("id", "transaction_no", "card_id", "package_id", "network_id", "agent_id", "price", "package_name", "network_name", "agent_username", "sold_at") VALUES ('2ebc8dba-9eaf-4cf5-a2d9-a89b3aa25d97', 'TX-20260725-51101', '0b8b3a7b-544f-4c00-a187-b1c8613f9482', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '025e2f6e-9e49-44e3-9b3c-9a7b75330d9d', 30.00, 'باقــــة شهري', 'الزري نت اللاسلكية', 'u777020155', '2026-07-25 17:23:32.853893+00');
INSERT INTO "public"."sales" ("id", "transaction_no", "card_id", "package_id", "network_id", "agent_id", "price", "package_name", "network_name", "agent_username", "sold_at") VALUES ('69e7e056-b6f1-4a60-b03e-25e51005206d', 'TX-20260726-69861', '858053cb-4a51-41b4-a6ee-069ff3b6fe89', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', 'd39b2b0f-80a7-44bd-93a1-a611baf470fd', 30.00, 'باقــــة شهري', 'الزري نت اللاسلكية', 'u775649620', '2026-07-26 11:40:41.668406+00');
INSERT INTO "public"."sales" ("id", "transaction_no", "card_id", "package_id", "network_id", "agent_id", "price", "package_name", "network_name", "agent_username", "sold_at") VALUES ('579f1d1e-5852-43be-8ef3-21e1f65d4cd6', 'TX-20260722-17767', '844158a5-fd86-4685-9830-58c50a10c46e', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '025e2f6e-9e49-44e3-9b3c-9a7b75330d9d', 30.00, 'باقــــة شهري', 'الزري نت اللاسلكية', 'u777020155', '2026-07-22 08:15:23.309796+00');
INSERT INTO "public"."sales" ("id", "transaction_no", "card_id", "package_id", "network_id", "agent_id", "price", "package_name", "network_name", "agent_username", "sold_at") VALUES ('27e85648-b6c5-4c53-893d-8fa1d6c0b23b', 'TX-20260724-74854', 'abde1c17-4871-4570-afc0-ff65c920dc17', '9cfea196-ce3d-4843-8d5c-df310bfa0e07', '9534b2cd-a133-4629-9056-8eb5043bf354', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', 30.00, 'شهريه', 'الواثق نت الفضائية', 'u778492883', '2026-07-24 12:08:59.054207+00');
INSERT INTO "public"."sales" ("id", "transaction_no", "card_id", "package_id", "network_id", "agent_id", "price", "package_name", "network_name", "agent_username", "sold_at") VALUES ('4a18457a-8db3-4614-a3fa-d0894bc0f42e', 'TX-20260724-83103', 'be404140-1d6f-4c42-ada9-b80a9bf97c7e', '9cfea196-ce3d-4843-8d5c-df310bfa0e07', '9534b2cd-a133-4629-9056-8eb5043bf354', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', 30.00, 'شهريه', 'الواثق نت الفضائية', 'u778492883', '2026-07-24 13:00:37.213167+00');
INSERT INTO "public"."sales" ("id", "transaction_no", "card_id", "package_id", "network_id", "agent_id", "price", "package_name", "network_name", "agent_username", "sold_at") VALUES ('9901835d-8ef8-4594-a1ab-58826ae4e6fe', 'TX-20260724-55290', '1d4f9755-d406-4aab-8255-820364e9759b', '9cfea196-ce3d-4843-8d5c-df310bfa0e07', '9534b2cd-a133-4629-9056-8eb5043bf354', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', 30.00, 'شهريه', 'الواثق نت الفضائية', 'u778492883', '2026-07-24 13:00:37.804172+00');
INSERT INTO "public"."sales" ("id", "transaction_no", "card_id", "package_id", "network_id", "agent_id", "price", "package_name", "network_name", "agent_username", "sold_at") VALUES ('e6c049ac-de32-47e2-ae3d-48965c0da110', 'TX-20260721-68250', 'dfdc3755-195c-4164-8cfe-afc4f17a8540', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '025e2f6e-9e49-44e3-9b3c-9a7b75330d9d', 30.00, 'باقــــة شهري', 'الزري نت اللاسلكية', 'u777020155', '2026-07-21 13:57:22.308049+00');
INSERT INTO "public"."sales" ("id", "transaction_no", "card_id", "package_id", "network_id", "agent_id", "price", "package_name", "network_name", "agent_username", "sold_at") VALUES ('722879cf-14ce-419a-b7bc-692e464b2630', 'TX-20260721-67104', 'f035e3fe-f436-4e6c-bd16-6f3543d6f6bd', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', 'e608fa82-347a-4ed2-b838-33af5a4fde4a', 30.00, 'باقــــة شهري', 'الزري نت اللاسلكية', 'u774818215', '2026-07-21 15:09:15.322675+00');
INSERT INTO "public"."sales" ("id", "transaction_no", "card_id", "package_id", "network_id", "agent_id", "price", "package_name", "network_name", "agent_username", "sold_at") VALUES ('4d9724f9-9e3d-438f-b917-4f1862cae72e', 'TX-20260721-36221', '05d1bfb1-5b90-4345-9455-af8420ae08f1', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', 'e608fa82-347a-4ed2-b838-33af5a4fde4a', 30.00, 'باقــــة شهري', 'الزري نت اللاسلكية', 'u774818215', '2026-07-21 16:04:22.826763+00');
INSERT INTO "public"."sales" ("id", "transaction_no", "card_id", "package_id", "network_id", "agent_id", "price", "package_name", "network_name", "agent_username", "sold_at") VALUES ('5e277605-0420-4550-9987-f65da908a3fb', 'TX-20260721-61692', '5d8410b0-67fa-4117-a181-15bb6cdc06ea', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', 'e608fa82-347a-4ed2-b838-33af5a4fde4a', 30.00, 'باقــــة شهري', 'الزري نت اللاسلكية', 'u774818215', '2026-07-21 16:05:01.853025+00');
INSERT INTO "public"."sales" ("id", "transaction_no", "card_id", "package_id", "network_id", "agent_id", "price", "package_name", "network_name", "agent_username", "sold_at") VALUES ('fa9fc281-2b1d-4bb7-bf49-3cd860aa53bf', 'TX-20260721-06247', '56a7aa50-c7f1-43a3-932f-98e004355849', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', 'e608fa82-347a-4ed2-b838-33af5a4fde4a', 30.00, 'باقــــة شهري', 'الزري نت اللاسلكية', 'u774818215', '2026-07-21 18:15:36.821189+00');
INSERT INTO "public"."sales" ("id", "transaction_no", "card_id", "package_id", "network_id", "agent_id", "price", "package_name", "network_name", "agent_username", "sold_at") VALUES ('67d2772d-36ee-48dc-925a-ff0096d107e1', 'TX-20260721-04932', 'c604869d-6f1c-495c-bb6c-8b51e1e8df91', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', 'e608fa82-347a-4ed2-b838-33af5a4fde4a', 30.00, 'باقــــة شهري', 'الزري نت اللاسلكية', 'u774818215', '2026-07-21 18:26:40.091035+00');
INSERT INTO "public"."sales" ("id", "transaction_no", "card_id", "package_id", "network_id", "agent_id", "price", "package_name", "network_name", "agent_username", "sold_at") VALUES ('8b0d8f08-d374-4eac-a3c3-73a9fe52abcb', 'TX-20260724-92215', 'de88b69d-699b-4816-8d01-4e97c50804bf', '9cfea196-ce3d-4843-8d5c-df310bfa0e07', '9534b2cd-a133-4629-9056-8eb5043bf354', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', 30.00, 'شهريه', 'الواثق نت الفضائية', 'u778492883', '2026-07-24 13:00:36.558412+00');
INSERT INTO "public"."sales" ("id", "transaction_no", "card_id", "package_id", "network_id", "agent_id", "price", "package_name", "network_name", "agent_username", "sold_at") VALUES ('9b6f10cf-4ddf-4f45-81c6-b4f6fc62672a', 'TX-20260724-60202', '35f29c9a-6e9c-4468-82de-107089056726', '9cfea196-ce3d-4843-8d5c-df310bfa0e07', '9534b2cd-a133-4629-9056-8eb5043bf354', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', 30.00, 'شهريه', 'الواثق نت الفضائية', 'u778492883', '2026-07-24 13:00:37.328956+00');
INSERT INTO "public"."sales" ("id", "transaction_no", "card_id", "package_id", "network_id", "agent_id", "price", "package_name", "network_name", "agent_username", "sold_at") VALUES ('7ef67f5b-d748-4be7-8faa-05d09475e891', 'TX-20260724-02581', '2ad45d35-8589-4a89-92c6-31409543efff', '9cfea196-ce3d-4843-8d5c-df310bfa0e07', '9534b2cd-a133-4629-9056-8eb5043bf354', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', 30.00, 'شهريه', 'الواثق نت الفضائية', 'u778492883', '2026-07-24 13:00:37.590641+00');
INSERT INTO "public"."sales" ("id", "transaction_no", "card_id", "package_id", "network_id", "agent_id", "price", "package_name", "network_name", "agent_username", "sold_at") VALUES ('ca52d6a2-e505-4903-882c-44199f4f3776', 'TX-20260724-04061', 'bfcfcf63-4b54-439b-ab15-59354ccb44a5', '9cfea196-ce3d-4843-8d5c-df310bfa0e07', '9534b2cd-a133-4629-9056-8eb5043bf354', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', 30.00, 'شهريه', 'الواثق نت الفضائية', 'u778492883', '2026-07-24 13:00:37.906252+00');
INSERT INTO "public"."sales" ("id", "transaction_no", "card_id", "package_id", "network_id", "agent_id", "price", "package_name", "network_name", "agent_username", "sold_at") VALUES ('3b3c6e76-57dd-4bb2-aa19-1e1a85db0042', 'TX-20260725-34091', '3392d4ea-2390-49a3-8ce8-391b3edad33d', 'b0240155-ef23-401e-9c72-c28800ac06ce', '4664887b-9955-40c1-be8d-d2a934d2c942', '025e2f6e-9e49-44e3-9b3c-9a7b75330d9d', 30.00, 'باقــــة شهري', 'الزري نت اللاسلكية', 'u777020155', '2026-07-25 16:55:29.797812+00');


--
-- Data for Name: user_roles; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO "public"."user_roles" ("id", "user_id", "role", "created_at") VALUES ('d4eb829e-559c-4ac2-9b63-fc6e397b4a73', 'd39b2b0f-80a7-44bd-93a1-a611baf470fd', 'agent', '2026-07-21 12:32:16.573098+00');
INSERT INTO "public"."user_roles" ("id", "user_id", "role", "created_at") VALUES ('d7004e30-8fa3-4325-a9b3-34a598602be5', '025e2f6e-9e49-44e3-9b3c-9a7b75330d9d', 'agent', '2026-07-21 13:24:25.090594+00');
INSERT INTO "public"."user_roles" ("id", "user_id", "role", "created_at") VALUES ('573964b3-6b64-406b-9923-224535f404d8', 'c22e26ca-03bd-419a-8f40-89a3ae772247', 'agent', '2026-07-21 13:49:37.322972+00');
INSERT INTO "public"."user_roles" ("id", "user_id", "role", "created_at") VALUES ('1b697290-5f76-4750-98d6-fe40a3de0557', 'e608fa82-347a-4ed2-b838-33af5a4fde4a', 'agent', '2026-07-21 14:18:10.111754+00');
INSERT INTO "public"."user_roles" ("id", "user_id", "role", "created_at") VALUES ('a9b12cc2-2647-420d-8d05-8108346489be', 'bb568927-a332-4fe5-a636-a4dd67cc4e57', 'admin', '2026-07-24 12:03:48.936136+00');
INSERT INTO "public"."user_roles" ("id", "user_id", "role", "created_at") VALUES ('c6eb0f3c-ac2a-4324-89cb-6dfbdc5e4ade', 'c87ef36a-0edb-4344-95aa-fa4be66a841e', 'agent', '2026-07-24 12:07:04.471258+00');
INSERT INTO "public"."user_roles" ("id", "user_id", "role", "created_at") VALUES ('cfc49a89-97ae-401e-8085-76f03133a12f', '115cc622-7b6e-4324-a75f-91d14cf2c053', 'agent', '2026-07-24 23:45:42.649919+00');
INSERT INTO "public"."user_roles" ("id", "user_id", "role", "created_at") VALUES ('2c62b410-fdd1-4d4d-8c3c-a28ddf7a7766', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', 'superadmin', '2026-07-26 00:18:33.393154+00');
INSERT INTO "public"."user_roles" ("id", "user_id", "role", "created_at") VALUES ('0eecbb8a-a265-452e-8cd7-192eb66d9993', 'cf7a1ea4-c73e-4da8-a3a3-33e59bfe02cd', 'admin', '2026-07-26 00:37:55.383544+00');
INSERT INTO "public"."user_roles" ("id", "user_id", "role", "created_at") VALUES ('d5540a89-b0e7-4de5-b6bc-28a98fc875c9', 'de380cef-b6f1-4070-80d4-096d1b1f4c76', 'admin', '2026-07-26 01:01:39.430995+00');


--
-- Name: card_requests card_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."card_requests"
    ADD CONSTRAINT "card_requests_pkey" PRIMARY KEY ("id");


--
-- Name: cards cards_package_id_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."cards"
    ADD CONSTRAINT "cards_package_id_username_key" UNIQUE ("package_id", "username");


--
-- Name: cards cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."cards"
    ADD CONSTRAINT "cards_pkey" PRIMARY KEY ("id");


--
-- Name: join_requests join_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."join_requests"
    ADD CONSTRAINT "join_requests_pkey" PRIMARY KEY ("id");


--
-- Name: logs logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."logs"
    ADD CONSTRAINT "logs_pkey" PRIMARY KEY ("id");


--
-- Name: networks networks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."networks"
    ADD CONSTRAINT "networks_pkey" PRIMARY KEY ("id");


--
-- Name: packages packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."packages"
    ADD CONSTRAINT "packages_pkey" PRIMARY KEY ("id");


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");


--
-- Name: profiles profiles_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");


--
-- Name: request_payments request_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."request_payments"
    ADD CONSTRAINT "request_payments_pkey" PRIMARY KEY ("id");


--
-- Name: sales sales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_pkey" PRIMARY KEY ("id");


--
-- Name: sales sales_transaction_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_transaction_no_key" UNIQUE ("transaction_no");


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_role_key" UNIQUE ("user_id", "role");


--
-- Name: card_requests_agent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "card_requests_agent_idx" ON "public"."card_requests" USING "btree" ("agent_id", "created_at" DESC);


--
-- Name: card_requests_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "card_requests_status_idx" ON "public"."card_requests" USING "btree" ("status", "created_at" DESC);


--
-- Name: cards_assigned_to_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "cards_assigned_to_idx" ON "public"."cards" USING "btree" ("assigned_to", "package_id") WHERE ("status" = 'ASSIGNED'::"public"."card_status");


--
-- Name: cards_pkg_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "cards_pkg_status_idx" ON "public"."cards" USING "btree" ("package_id", "status");


--
-- Name: cards_sold_to_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "cards_sold_to_idx" ON "public"."cards" USING "btree" ("sold_to");


--
-- Name: join_requests_agent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "join_requests_agent_idx" ON "public"."join_requests" USING "btree" ("agent_id");


--
-- Name: join_requests_network_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "join_requests_network_status_idx" ON "public"."join_requests" USING "btree" ("network_id", "status");


--
-- Name: logs_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "logs_created_idx" ON "public"."logs" USING "btree" ("created_at" DESC);


--
-- Name: networks_name_lower_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "networks_name_lower_uidx" ON "public"."networks" USING "btree" ("lower"("name"));


--
-- Name: networks_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "networks_owner_idx" ON "public"."networks" USING "btree" ("owner_id");


--
-- Name: packages_network_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "packages_network_idx" ON "public"."packages" USING "btree" ("network_id");


--
-- Name: profiles_network_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "profiles_network_idx" ON "public"."profiles" USING "btree" ("network_id");


--
-- Name: sales_agent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "sales_agent_idx" ON "public"."sales" USING "btree" ("agent_id");


--
-- Name: sales_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "sales_date_idx" ON "public"."sales" USING "btree" ("sold_at" DESC);


--
-- Name: sales_pkg_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "sales_pkg_idx" ON "public"."sales" USING "btree" ("package_id");


--
-- Name: card_requests card_requests_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "card_requests_touch" BEFORE UPDATE ON "public"."card_requests" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();


--
-- Name: networks networks_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "networks_touch" BEFORE UPDATE ON "public"."networks" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();


--
-- Name: packages packages_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "packages_touch" BEFORE UPDATE ON "public"."packages" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();


--
-- Name: profiles prevent_non_admin_activation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "prevent_non_admin_activation" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_non_admin_activation"();


--
-- Name: profiles profiles_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "profiles_touch" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();


--
-- Name: profiles trg_prevent_profile_privilege_escalation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_prevent_profile_privilege_escalation" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_profile_privilege_escalation"();


--
-- Name: card_requests card_requests_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."card_requests"
    ADD CONSTRAINT "card_requests_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: card_requests card_requests_decided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."card_requests"
    ADD CONSTRAINT "card_requests_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: card_requests card_requests_network_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."card_requests"
    ADD CONSTRAINT "card_requests_network_id_fkey" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE CASCADE;


--
-- Name: card_requests card_requests_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."card_requests"
    ADD CONSTRAINT "card_requests_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE CASCADE;


--
-- Name: cards cards_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."cards"
    ADD CONSTRAINT "cards_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: cards cards_network_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."cards"
    ADD CONSTRAINT "cards_network_id_fkey" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE CASCADE;


--
-- Name: cards cards_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."cards"
    ADD CONSTRAINT "cards_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE CASCADE;


--
-- Name: cards cards_sold_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."cards"
    ADD CONSTRAINT "cards_sold_to_fkey" FOREIGN KEY ("sold_to") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: join_requests join_requests_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."join_requests"
    ADD CONSTRAINT "join_requests_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: join_requests join_requests_decided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."join_requests"
    ADD CONSTRAINT "join_requests_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: join_requests join_requests_network_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."join_requests"
    ADD CONSTRAINT "join_requests_network_id_fkey" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE CASCADE;


--
-- Name: logs logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."logs"
    ADD CONSTRAINT "logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: networks networks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."networks"
    ADD CONSTRAINT "networks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: networks networks_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."networks"
    ADD CONSTRAINT "networks_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: packages packages_network_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."packages"
    ADD CONSTRAINT "packages_network_id_fkey" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: profiles profiles_network_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_network_id_fkey" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE SET NULL;


--
-- Name: request_payments request_payments_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."request_payments"
    ADD CONSTRAINT "request_payments_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."card_requests"("id") ON DELETE CASCADE;


--
-- Name: sales sales_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: sales sales_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE CASCADE;


--
-- Name: sales sales_network_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_network_id_fkey" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE CASCADE;


--
-- Name: sales sales_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: card_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."card_requests" ENABLE ROW LEVEL SECURITY;

--
-- Name: cards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."cards" ENABLE ROW LEVEL SECURITY;

--
-- Name: cards cards admin delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cards admin delete" ON "public"."cards" FOR DELETE TO "authenticated" USING (("network_id" = "public"."admin_network"("auth"."uid"())));


--
-- Name: cards cards admin insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cards admin insert" ON "public"."cards" FOR INSERT TO "authenticated" WITH CHECK (("network_id" = "public"."admin_network"("auth"."uid"())));


--
-- Name: cards cards admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cards admin update" ON "public"."cards" FOR UPDATE TO "authenticated" USING (("network_id" = "public"."admin_network"("auth"."uid"())));


--
-- Name: cards cards read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cards read" ON "public"."cards" FOR SELECT TO "authenticated" USING ((("network_id" = "public"."admin_network"("auth"."uid"())) OR ("assigned_to" = "auth"."uid"()) OR ("sold_to" = "auth"."uid"())));


--
-- Name: card_requests cr admin delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cr admin delete" ON "public"."card_requests" FOR DELETE TO "authenticated" USING (("network_id" = "public"."admin_network"("auth"."uid"())));


--
-- Name: card_requests cr admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cr admin update" ON "public"."card_requests" FOR UPDATE TO "authenticated" USING (("network_id" = "public"."admin_network"("auth"."uid"()))) WITH CHECK (("network_id" = "public"."admin_network"("auth"."uid"())));


--
-- Name: card_requests cr agent insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cr agent insert" ON "public"."card_requests" FOR INSERT TO "authenticated" WITH CHECK ((("agent_id" = "auth"."uid"()) AND "public"."is_active_user"("auth"."uid"())));


--
-- Name: card_requests cr read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "cr read" ON "public"."card_requests" FOR SELECT TO "authenticated" USING ((("agent_id" = "auth"."uid"()) OR ("network_id" = "public"."admin_network"("auth"."uid"()))));


--
-- Name: join_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."join_requests" ENABLE ROW LEVEL SECURITY;

--
-- Name: join_requests jr admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "jr admin update" ON "public"."join_requests" FOR UPDATE TO "authenticated" USING (("network_id" = "public"."admin_network"("auth"."uid"()))) WITH CHECK (("network_id" = "public"."admin_network"("auth"."uid"())));


--
-- Name: join_requests jr read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "jr read" ON "public"."join_requests" FOR SELECT TO "authenticated" USING ((("agent_id" = "auth"."uid"()) OR ("network_id" = "public"."admin_network"("auth"."uid"()))));


--
-- Name: logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."logs" ENABLE ROW LEVEL SECURITY;

--
-- Name: logs logs admin delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "logs admin delete" ON "public"."logs" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "logs"."user_id") AND ("p"."network_id" = "public"."admin_network"("auth"."uid"()))))));


--
-- Name: logs logs read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "logs read" ON "public"."logs" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "logs"."user_id") AND ("p"."network_id" = "public"."admin_network"("auth"."uid"())))))));


--
-- Name: networks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."networks" ENABLE ROW LEVEL SECURITY;

--
-- Name: networks networks owner delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "networks owner delete" ON "public"."networks" FOR DELETE TO "authenticated" USING (("owner_id" = "auth"."uid"()));


--
-- Name: networks networks owner update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "networks owner update" ON "public"."networks" FOR UPDATE TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));


--
-- Name: networks networks read own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "networks read own" ON "public"."networks" FOR SELECT TO "authenticated" USING ((("owner_id" = "auth"."uid"()) OR ("id" = ( SELECT "profiles"."network_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))));


--
-- Name: packages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."packages" ENABLE ROW LEVEL SECURITY;

--
-- Name: packages packages admin delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "packages admin delete" ON "public"."packages" FOR DELETE TO "authenticated" USING (("network_id" = "public"."admin_network"("auth"."uid"())));


--
-- Name: packages packages admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "packages admin update" ON "public"."packages" FOR UPDATE TO "authenticated" USING (("network_id" = "public"."admin_network"("auth"."uid"()))) WITH CHECK (("network_id" = "public"."admin_network"("auth"."uid"())));


--
-- Name: packages packages admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "packages admin write" ON "public"."packages" FOR INSERT TO "authenticated" WITH CHECK (("network_id" = "public"."admin_network"("auth"."uid"())));


--
-- Name: packages packages read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "packages read" ON "public"."packages" FOR SELECT TO "authenticated" USING ((("network_id" = "public"."admin_network"("auth"."uid"())) OR ("is_active" AND "public"."is_active_user"("auth"."uid"()) AND ("network_id" = ( SELECT "profiles"."network_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))))));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles admin delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles admin delete" ON "public"."profiles" FOR DELETE TO "authenticated" USING (("network_id" = "public"."admin_network"("auth"."uid"())));


--
-- Name: profiles profiles read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles read" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR ("network_id" = "public"."admin_network"("auth"."uid"())) OR (EXISTS ( SELECT 1
   FROM "public"."join_requests" "jr"
  WHERE (("jr"."agent_id" = "profiles"."id") AND ("jr"."network_id" = "public"."admin_network"("auth"."uid"())) AND ("jr"."status" = 'PENDING'::"text"))))));


--
-- Name: profiles profiles self insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles self insert" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("id" = "auth"."uid"()));


--
-- Name: profiles profiles update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles update" ON "public"."profiles" FOR UPDATE USING ((("id" = "auth"."uid"()) OR ("network_id" = "public"."admin_network"("auth"."uid"())))) WITH CHECK ((("id" = "auth"."uid"()) OR ("network_id" = "public"."admin_network"("auth"."uid"()))));


--
-- Name: request_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."request_payments" ENABLE ROW LEVEL SECURITY;

--
-- Name: request_payments rp read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "rp read" ON "public"."request_payments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."card_requests" "r"
  WHERE (("r"."id" = "request_payments"."request_id") AND (("r"."agent_id" = "auth"."uid"()) OR ("r"."network_id" = "public"."admin_network"("auth"."uid"())))))));


--
-- Name: sales; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."sales" ENABLE ROW LEVEL SECURITY;

--
-- Name: sales sales read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sales read" ON "public"."sales" FOR SELECT TO "authenticated" USING ((("network_id" = "public"."admin_network"("auth"."uid"())) OR ("agent_id" = "auth"."uid"())));


--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles user_roles read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_roles read" ON "public"."user_roles" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "user_roles"."user_id") AND ("p"."network_id" = "public"."admin_network"("auth"."uid"())))))));


--
-- Name: SCHEMA "public"; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
GRANT USAGE ON SCHEMA "public" TO "sandbox_exec";


--
-- Name: FUNCTION "admin_delete_cards"("_ids" "uuid"[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."admin_delete_cards"("_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_delete_cards"("_ids" "uuid"[]) TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_delete_cards"("_ids" "uuid"[]) TO "sandbox_exec";
GRANT ALL ON FUNCTION "public"."admin_delete_cards"("_ids" "uuid"[]) TO "authenticated";


--
-- Name: FUNCTION "admin_delete_cards"("_ids" "uuid"[], "_force" boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."admin_delete_cards"("_ids" "uuid"[], "_force" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_delete_cards"("_ids" "uuid"[], "_force" boolean) TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_delete_cards"("_ids" "uuid"[], "_force" boolean) TO "sandbox_exec";
GRANT ALL ON FUNCTION "public"."admin_delete_cards"("_ids" "uuid"[], "_force" boolean) TO "authenticated";


--
-- Name: FUNCTION "admin_delete_network"("_network_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."admin_delete_network"("_network_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_delete_network"("_network_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_delete_network"("_network_id" "uuid") TO "sandbox_exec";
GRANT ALL ON FUNCTION "public"."admin_delete_network"("_network_id" "uuid") TO "authenticated";


--
-- Name: FUNCTION "admin_delete_package"("_package_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."admin_delete_package"("_package_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_delete_package"("_package_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_delete_package"("_package_id" "uuid") TO "sandbox_exec";
GRANT ALL ON FUNCTION "public"."admin_delete_package"("_package_id" "uuid") TO "authenticated";


--
-- Name: FUNCTION "admin_list_cards"("_network_id" "uuid", "_package_id" "uuid", "_agent_id" "uuid", "_search" "text", "_limit" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."admin_list_cards"("_network_id" "uuid", "_package_id" "uuid", "_agent_id" "uuid", "_search" "text", "_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_list_cards"("_network_id" "uuid", "_package_id" "uuid", "_agent_id" "uuid", "_search" "text", "_limit" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_list_cards"("_network_id" "uuid", "_package_id" "uuid", "_agent_id" "uuid", "_search" "text", "_limit" integer) TO "sandbox_exec";
GRANT ALL ON FUNCTION "public"."admin_list_cards"("_network_id" "uuid", "_package_id" "uuid", "_agent_id" "uuid", "_search" "text", "_limit" integer) TO "authenticated";


--
-- Name: FUNCTION "admin_network"("_uid" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."admin_network"("_uid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_network"("_uid" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_network"("_uid" "uuid") TO "sandbox_exec";
GRANT ALL ON FUNCTION "public"."admin_network"("_uid" "uuid") TO "authenticated";


--
-- Name: FUNCTION "admin_stats"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."admin_stats"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_stats"() TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_stats"() TO "sandbox_exec";
GRANT ALL ON FUNCTION "public"."admin_stats"() TO "authenticated";


--
-- Name: FUNCTION "admin_unassign_cards"("_ids" "uuid"[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."admin_unassign_cards"("_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_unassign_cards"("_ids" "uuid"[]) TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_unassign_cards"("_ids" "uuid"[]) TO "sandbox_exec";
GRANT ALL ON FUNCTION "public"."admin_unassign_cards"("_ids" "uuid"[]) TO "authenticated";


--
-- Name: FUNCTION "admin_wipe_database"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."admin_wipe_database"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_wipe_database"() TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_wipe_database"() TO "sandbox_exec";
GRANT ALL ON FUNCTION "public"."admin_wipe_database"() TO "authenticated";


--
-- Name: FUNCTION "agent_cabin"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."agent_cabin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."agent_cabin"() TO "service_role";
GRANT ALL ON FUNCTION "public"."agent_cabin"() TO "sandbox_exec";
GRANT ALL ON FUNCTION "public"."agent_cabin"() TO "authenticated";


--
-- Name: FUNCTION "approve_card_request"("_request_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."approve_card_request"("_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."approve_card_request"("_request_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."approve_card_request"("_request_id" "uuid") TO "sandbox_exec";
GRANT ALL ON FUNCTION "public"."approve_card_request"("_request_id" "uuid") TO "authenticated";


--
-- Name: FUNCTION "approve_join_request"("_request_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."approve_join_request"("_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."approve_join_request"("_request_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."approve_join_request"("_request_id" "uuid") TO "sandbox_exec";
GRANT ALL ON FUNCTION "public"."approve_join_request"("_request_id" "uuid") TO "authenticated";


--
-- Name: FUNCTION "bulk_upload_cards"("_package_id" "uuid", "_entries" "jsonb"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."bulk_upload_cards"("_package_id" "uuid", "_entries" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bulk_upload_cards"("_package_id" "uuid", "_entries" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."bulk_upload_cards"("_package_id" "uuid", "_entries" "jsonb") TO "sandbox_exec";
GRANT ALL ON FUNCTION "public"."bulk_upload_cards"("_package_id" "uuid", "_entries" "jsonb") TO "authenticated";


--
-- Name: FUNCTION "create_my_network"("_name" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."create_my_network"("_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_my_network"("_name" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."create_my_network"("_name" "text") TO "sandbox_exec";
GRANT ALL ON FUNCTION "public"."create_my_network"("_name" "text") TO "authenticated";


--
-- Name: FUNCTION "handle_new_user"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "sandbox_exec";


--
-- Name: FUNCTION "has_role"("_user_id" "uuid", "_role" "public"."app_role"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "service_role";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "sandbox_exec";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "authenticated";


--
-- Name: FUNCTION "is_active_user"("_user_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."is_active_user"("_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_active_user"("_user_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."is_active_user"("_user_id" "uuid") TO "sandbox_exec";
GRANT ALL ON FUNCTION "public"."is_active_user"("_user_id" "uuid") TO "authenticated";


--
-- Name: FUNCTION "is_superadmin"("_uid" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."is_superadmin"("_uid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_superadmin"("_uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_superadmin"("_uid" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."is_superadmin"("_uid" "uuid") TO "sandbox_exec";


--
-- Name: FUNCTION "list_active_networks"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."list_active_networks"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_active_networks"() TO "service_role";
GRANT ALL ON FUNCTION "public"."list_active_networks"() TO "sandbox_exec";
GRANT ALL ON FUNCTION "public"."list_active_networks"() TO "anon";
GRANT ALL ON FUNCTION "public"."list_active_networks"() TO "authenticated";


--
-- Name: FUNCTION "package_counts"("_network_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."package_counts"("_network_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."package_counts"("_network_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."package_counts"("_network_id" "uuid") TO "sandbox_exec";
GRANT ALL ON FUNCTION "public"."package_counts"("_network_id" "uuid") TO "authenticated";


--
-- Name: FUNCTION "prevent_non_admin_activation"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."prevent_non_admin_activation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_non_admin_activation"() TO "service_role";
GRANT ALL ON FUNCTION "public"."prevent_non_admin_activation"() TO "sandbox_exec";


--
-- Name: FUNCTION "prevent_profile_privilege_escalation"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."prevent_profile_privilege_escalation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_profile_privilege_escalation"() TO "service_role";
GRANT ALL ON FUNCTION "public"."prevent_profile_privilege_escalation"() TO "sandbox_exec";


--
-- Name: FUNCTION "record_request_payment"("_request_id" "uuid", "_amount" numeric, "_note" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."record_request_payment"("_request_id" "uuid", "_amount" numeric, "_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_request_payment"("_request_id" "uuid", "_amount" numeric, "_note" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."record_request_payment"("_request_id" "uuid", "_amount" numeric, "_note" "text") TO "sandbox_exec";
GRANT ALL ON FUNCTION "public"."record_request_payment"("_request_id" "uuid", "_amount" numeric, "_note" "text") TO "authenticated";


--
-- Name: FUNCTION "reject_card_request"("_request_id" "uuid", "_reason" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."reject_card_request"("_request_id" "uuid", "_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reject_card_request"("_request_id" "uuid", "_reason" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."reject_card_request"("_request_id" "uuid", "_reason" "text") TO "sandbox_exec";
GRANT ALL ON FUNCTION "public"."reject_card_request"("_request_id" "uuid", "_reason" "text") TO "authenticated";


--
-- Name: FUNCTION "reject_join_request"("_request_id" "uuid", "_reason" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."reject_join_request"("_request_id" "uuid", "_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reject_join_request"("_request_id" "uuid", "_reason" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."reject_join_request"("_request_id" "uuid", "_reason" "text") TO "sandbox_exec";
GRANT ALL ON FUNCTION "public"."reject_join_request"("_request_id" "uuid", "_reason" "text") TO "authenticated";


--
-- Name: FUNCTION "request_cards"("_package_id" "uuid", "_quantity" integer, "_notes" "text", "_payment_method" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."request_cards"("_package_id" "uuid", "_quantity" integer, "_notes" "text", "_payment_method" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_cards"("_package_id" "uuid", "_quantity" integer, "_notes" "text", "_payment_method" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."request_cards"("_package_id" "uuid", "_quantity" integer, "_notes" "text", "_payment_method" "text") TO "sandbox_exec";
GRANT ALL ON FUNCTION "public"."request_cards"("_package_id" "uuid", "_quantity" integer, "_notes" "text", "_payment_method" "text") TO "authenticated";


--
-- Name: FUNCTION "sell_card"("_package_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."sell_card"("_package_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sell_card"("_package_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."sell_card"("_package_id" "uuid") TO "sandbox_exec";
GRANT ALL ON FUNCTION "public"."sell_card"("_package_id" "uuid") TO "authenticated";


--
-- Name: FUNCTION "set_agent_active"("_agent_id" "uuid", "_active" boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."set_agent_active"("_agent_id" "uuid", "_active" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_agent_active"("_agent_id" "uuid", "_active" boolean) TO "service_role";
GRANT ALL ON FUNCTION "public"."set_agent_active"("_agent_id" "uuid", "_active" boolean) TO "sandbox_exec";
GRANT ALL ON FUNCTION "public"."set_agent_active"("_agent_id" "uuid", "_active" boolean) TO "authenticated";


--
-- Name: FUNCTION "set_agent_network"("_agent_id" "uuid", "_network_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."set_agent_network"("_agent_id" "uuid", "_network_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_agent_network"("_agent_id" "uuid", "_network_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."set_agent_network"("_agent_id" "uuid", "_network_id" "uuid") TO "sandbox_exec";
GRANT ALL ON FUNCTION "public"."set_agent_network"("_agent_id" "uuid", "_network_id" "uuid") TO "authenticated";


--
-- Name: FUNCTION "settle_agent_debt"("_agent_id" "uuid", "_amount" numeric, "_note" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."settle_agent_debt"("_agent_id" "uuid", "_amount" numeric, "_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."settle_agent_debt"("_agent_id" "uuid", "_amount" numeric, "_note" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."settle_agent_debt"("_agent_id" "uuid", "_amount" numeric, "_note" "text") TO "sandbox_exec";
GRANT ALL ON FUNCTION "public"."settle_agent_debt"("_agent_id" "uuid", "_amount" numeric, "_note" "text") TO "authenticated";


--
-- Name: FUNCTION "superadmin_agents"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."superadmin_agents"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."superadmin_agents"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."superadmin_agents"() TO "service_role";
GRANT ALL ON FUNCTION "public"."superadmin_agents"() TO "sandbox_exec";


--
-- Name: FUNCTION "superadmin_cards"("_network_id" "uuid", "_package_id" "uuid", "_status" "text", "_search" "text", "_limit" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."superadmin_cards"("_network_id" "uuid", "_package_id" "uuid", "_status" "text", "_search" "text", "_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."superadmin_cards"("_network_id" "uuid", "_package_id" "uuid", "_status" "text", "_search" "text", "_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."superadmin_cards"("_network_id" "uuid", "_package_id" "uuid", "_status" "text", "_search" "text", "_limit" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."superadmin_cards"("_network_id" "uuid", "_package_id" "uuid", "_status" "text", "_search" "text", "_limit" integer) TO "sandbox_exec";


--
-- Name: FUNCTION "superadmin_create_network"("_name" "text", "_currency" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."superadmin_create_network"("_name" "text", "_currency" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."superadmin_create_network"("_name" "text", "_currency" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."superadmin_create_network"("_name" "text", "_currency" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."superadmin_create_network"("_name" "text", "_currency" "text") TO "sandbox_exec";


--
-- Name: FUNCTION "superadmin_create_package"("_network_id" "uuid", "_name" "text", "_price" numeric, "_data_size" "text", "_speed" "text", "_validity" "text", "_allowed_time" "text", "_color" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."superadmin_create_package"("_network_id" "uuid", "_name" "text", "_price" numeric, "_data_size" "text", "_speed" "text", "_validity" "text", "_allowed_time" "text", "_color" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."superadmin_create_package"("_network_id" "uuid", "_name" "text", "_price" numeric, "_data_size" "text", "_speed" "text", "_validity" "text", "_allowed_time" "text", "_color" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."superadmin_create_package"("_network_id" "uuid", "_name" "text", "_price" numeric, "_data_size" "text", "_speed" "text", "_validity" "text", "_allowed_time" "text", "_color" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."superadmin_create_package"("_network_id" "uuid", "_name" "text", "_price" numeric, "_data_size" "text", "_speed" "text", "_validity" "text", "_allowed_time" "text", "_color" "text") TO "sandbox_exec";


--
-- Name: FUNCTION "superadmin_delete_network"("_network_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."superadmin_delete_network"("_network_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."superadmin_delete_network"("_network_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."superadmin_delete_network"("_network_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."superadmin_delete_network"("_network_id" "uuid") TO "sandbox_exec";


--
-- Name: FUNCTION "superadmin_networks"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."superadmin_networks"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."superadmin_networks"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."superadmin_networks"() TO "service_role";
GRANT ALL ON FUNCTION "public"."superadmin_networks"() TO "sandbox_exec";


--
-- Name: FUNCTION "superadmin_packages"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."superadmin_packages"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."superadmin_packages"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."superadmin_packages"() TO "service_role";
GRANT ALL ON FUNCTION "public"."superadmin_packages"() TO "sandbox_exec";


--
-- Name: FUNCTION "superadmin_set_network_active"("_network_id" "uuid", "_active" boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."superadmin_set_network_active"("_network_id" "uuid", "_active" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."superadmin_set_network_active"("_network_id" "uuid", "_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."superadmin_set_network_active"("_network_id" "uuid", "_active" boolean) TO "service_role";
GRANT ALL ON FUNCTION "public"."superadmin_set_network_active"("_network_id" "uuid", "_active" boolean) TO "sandbox_exec";


--
-- Name: FUNCTION "superadmin_stats"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."superadmin_stats"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."superadmin_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."superadmin_stats"() TO "service_role";
GRANT ALL ON FUNCTION "public"."superadmin_stats"() TO "sandbox_exec";


--
-- Name: FUNCTION "touch_updated_at"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."touch_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "service_role";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "sandbox_exec";


--
-- Name: FUNCTION "username_from_phone"("_phone" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."username_from_phone"("_phone" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."username_from_phone"("_phone" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."username_from_phone"("_phone" "text") TO "sandbox_exec";
GRANT ALL ON FUNCTION "public"."username_from_phone"("_phone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."username_from_phone"("_phone" "text") TO "authenticated";


--
-- Name: TABLE "card_requests"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."card_requests" TO "anon";
GRANT ALL ON TABLE "public"."card_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."card_requests" TO "service_role";
GRANT SELECT,INSERT ON TABLE "public"."card_requests" TO "sandbox_exec";


--
-- Name: TABLE "cards"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."cards" TO "anon";
GRANT ALL ON TABLE "public"."cards" TO "authenticated";
GRANT ALL ON TABLE "public"."cards" TO "service_role";
GRANT SELECT,INSERT ON TABLE "public"."cards" TO "sandbox_exec";


--
-- Name: TABLE "join_requests"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."join_requests" TO "anon";
GRANT ALL ON TABLE "public"."join_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."join_requests" TO "service_role";
GRANT SELECT,INSERT ON TABLE "public"."join_requests" TO "sandbox_exec";


--
-- Name: TABLE "logs"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."logs" TO "anon";
GRANT ALL ON TABLE "public"."logs" TO "authenticated";
GRANT ALL ON TABLE "public"."logs" TO "service_role";
GRANT SELECT,INSERT ON TABLE "public"."logs" TO "sandbox_exec";


--
-- Name: TABLE "networks"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."networks" TO "anon";
GRANT ALL ON TABLE "public"."networks" TO "authenticated";
GRANT ALL ON TABLE "public"."networks" TO "service_role";
GRANT SELECT,INSERT ON TABLE "public"."networks" TO "sandbox_exec";


--
-- Name: TABLE "packages"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."packages" TO "anon";
GRANT ALL ON TABLE "public"."packages" TO "authenticated";
GRANT ALL ON TABLE "public"."packages" TO "service_role";
GRANT SELECT,INSERT ON TABLE "public"."packages" TO "sandbox_exec";


--
-- Name: TABLE "profiles"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";
GRANT SELECT,INSERT ON TABLE "public"."profiles" TO "sandbox_exec";


--
-- Name: TABLE "request_payments"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."request_payments" TO "anon";
GRANT ALL ON TABLE "public"."request_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."request_payments" TO "service_role";
GRANT SELECT,INSERT ON TABLE "public"."request_payments" TO "sandbox_exec";


--
-- Name: TABLE "sales"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."sales" TO "anon";
GRANT ALL ON TABLE "public"."sales" TO "authenticated";
GRANT ALL ON TABLE "public"."sales" TO "service_role";
GRANT SELECT,INSERT ON TABLE "public"."sales" TO "sandbox_exec";


--
-- Name: TABLE "user_roles"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."user_roles" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";
GRANT SELECT,INSERT ON TABLE "public"."user_roles" TO "sandbox_exec";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT,USAGE ON SEQUENCES TO "sandbox_exec";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "sandbox_exec";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT,INSERT ON TABLES TO "sandbox_exec";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- PostgreSQL database dump complete
--

\unrestrict Sqf53jJ9Q4s1iWSkEysuW883HAn1ZSNuZWpnf5fiTxjxSL2x6TYbnmkQIbibSOC

