-- Backfill card_number for existing sales
UPDATE public.sales s
SET card_number = c.username
FROM public.cards c
WHERE s.card_id = c.id AND s.card_number IS NULL;

-- Auto-fill card_number on new sales
CREATE OR REPLACE FUNCTION public.sales_fill_card_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.card_number IS NULL AND NEW.card_id IS NOT NULL THEN
    SELECT c.username INTO NEW.card_number FROM public.cards c WHERE c.id = NEW.card_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_fill_card_number ON public.sales;
CREATE TRIGGER trg_sales_fill_card_number
BEFORE INSERT ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.sales_fill_card_number();