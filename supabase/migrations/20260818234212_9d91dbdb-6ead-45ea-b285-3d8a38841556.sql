CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  network_id uuid NOT NULL REFERENCES public.networks(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_name text,
  title text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS announcements_network_created_idx ON public.announcements(network_id, created_at DESC);

GRANT SELECT, INSERT, DELETE ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS announcements_select_same_network ON public.announcements;
CREATE POLICY announcements_select_same_network ON public.announcements
FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles me WHERE me.id = auth.uid() AND me.network_id = announcements.network_id)
  OR public.is_superadmin(auth.uid())
);

DROP POLICY IF EXISTS announcements_insert_admin ON public.announcements;
CREATE POLICY announcements_insert_admin ON public.announcements
FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND (
    (public.has_role(auth.uid(), 'admin') AND EXISTS (
      SELECT 1 FROM public.profiles me WHERE me.id = auth.uid() AND me.network_id = announcements.network_id
    ))
    OR public.is_superadmin(auth.uid())
  )
);

DROP POLICY IF EXISTS announcements_delete_admin ON public.announcements;
CREATE POLICY announcements_delete_admin ON public.announcements
FOR DELETE TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin') AND EXISTS (
    SELECT 1 FROM public.profiles me WHERE me.id = auth.uid() AND me.network_id = announcements.network_id
  ))
  OR public.is_superadmin(auth.uid())
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.announcements;

-- Push tokens of all agents in a network (readable by an admin of that network)
CREATE OR REPLACE FUNCTION public.network_agent_push_tokens(_network_id uuid)
RETURNS TABLE(token text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT dt.token
  FROM public.device_tokens dt
  JOIN public.profiles p ON p.id = dt.user_id
  JOIN public.user_roles ur ON ur.user_id = dt.user_id AND ur.role = 'agent'
  WHERE p.network_id = _network_id
    AND p.is_active
    AND EXISTS (
      SELECT 1 FROM public.profiles me
      JOIN public.user_roles mur ON mur.user_id = me.id AND mur.role IN ('admin','superadmin')
      WHERE me.id = auth.uid() AND (mur.role = 'superadmin' OR me.network_id = _network_id)
    );
$$;

REVOKE ALL ON FUNCTION public.network_agent_push_tokens(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.network_agent_push_tokens(uuid) TO authenticated;