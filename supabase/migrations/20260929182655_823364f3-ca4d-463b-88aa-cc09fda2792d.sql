CREATE UNIQUE INDEX IF NOT EXISTS sales_card_id_unique ON public.sales(card_id) WHERE card_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.prevent_resell_card()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.card_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.sales WHERE card_id = NEW.card_id AND id <> NEW.id) THEN
    RAISE EXCEPTION 'CARD_ALREADY_SOLD';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_prevent_resell_card ON public.sales;
CREATE TRIGGER trg_prevent_resell_card BEFORE INSERT ON public.sales FOR EACH ROW EXECUTE FUNCTION public.prevent_resell_card();