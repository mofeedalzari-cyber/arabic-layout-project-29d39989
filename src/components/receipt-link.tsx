import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Receipt } from "lucide-react";

export function ReceiptLink({ path }: { path: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!path) return null;

  async function open() {
    setBusy(true);
    const { data, error } = await supabase.storage
      .from("order-receipts")
      .createSignedUrl(path!, 300);
    setBusy(false);
    if (error || !data?.signedUrl) {
      console.error(error);
      return toast.error("تعذر عرض صورة الإيصال");
    }
    setUrl(data.signedUrl);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="rounded-xl h-9"
        disabled={busy}
        onClick={() => void open()}
      >
        <Receipt className="h-4 w-4 ml-1" />
        {busy ? "جارٍ الفتح…" : "عرض الإيصال"}
      </Button>
      <Dialog open={!!url} onOpenChange={(o) => !o && setUrl(null)}>
        <DialogContent dir="rtl" className="text-right max-w-lg">
          <DialogHeader>
            <DialogTitle>إيصال الدفع</DialogTitle>
          </DialogHeader>
          {url && (
            <img
              src={url}
              alt="إيصال الدفع"
              className="w-full rounded-xl object-contain max-h-[70vh]"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
