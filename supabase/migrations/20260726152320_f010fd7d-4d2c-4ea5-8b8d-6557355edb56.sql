ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS buyer_name text;

CREATE POLICY "sales update buyer_name by agent"
ON public.sales
FOR UPDATE
TO authenticated
USING (agent_id = auth.uid())
WITH CHECK (agent_id = auth.uid());