import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Props = {
  queryKeys?: (string | readonly unknown[])[];
  className?: string;
  label?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
};

export function RefreshButton({
  queryKeys,
  className,
  label = "تحديث",
  variant = "outline",
  size = "sm",
}: Props) {
  const qc = useQueryClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onRefresh = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (queryKeys && queryKeys.length > 0) {
        await Promise.all(
          queryKeys.map((k) =>
            qc.invalidateQueries({
              queryKey: Array.isArray(k) ? (k as unknown[]) : [k as string],
            }),
          ),
        );
      } else {
        await qc.invalidateQueries();
      }
      await router.invalidate();
      toast.success("تم تحديث البيانات");
    } catch {
      toast.error("تعذر التحديث");
    } finally {
      setTimeout(() => setBusy(false), 400);
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={onRefresh}
      disabled={busy}
      className={cn("gap-2", className)}
    >
      <RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} />
      {label}
    </Button>
  );
}
