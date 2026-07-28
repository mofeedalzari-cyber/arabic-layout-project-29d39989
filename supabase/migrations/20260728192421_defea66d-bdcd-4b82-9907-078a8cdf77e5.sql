
CREATE TABLE public.customer_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL,
  network_id uuid,
  amount numeric NOT NULL CHECK (amount > 0),
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_customer_payments_customer ON public.customer_payments(customer_id);
CREATE INDEX idx_customer_payments_agent ON public.customer_payments(agent_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_payments TO authenticated;
GRANT ALL ON public.customer_payments TO service_role;

ALTER TABLE public.customer_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agents manage own customer payments"
  ON public.customer_payments FOR ALL
  TO authenticated
  USING (agent_id = auth.uid())
  WITH CHECK (agent_id = auth.uid());

CREATE POLICY "admins view network customer payments"
  ON public.customer_payments FOR SELECT
  TO authenticated
  USING (network_id IS NOT NULL AND network_id = admin_network(auth.uid()));
