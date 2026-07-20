import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  type CardTemplate, DEFAULT_TEMPLATE, loadTemplate, saveTemplate, clearTemplate,
} from "@/lib/card-print";

export function CardTemplateDialog({
  open, onOpenChange, packageId, packageName, sampleCode = "123456789",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  packageId: string;
  packageName: string;
  sampleCode?: string;
}) {
  const [tpl, setTpl] = useState<CardTemplate | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (open) setTpl(loadTemplate(packageId));
  }, [open, packageId]);

  function onFile(f: File) {
    if (!f.type.startsWith("image/")) {
      toast.error("يرجى اختيار صورة");
      return;
    }
    if (f.size > 3 * 1024 * 1024) {
      toast.error("الصورة كبيرة جدًا (الحد 3MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setTpl({ ...DEFAULT_TEMPLATE, ...(tpl ?? {}), image: String(reader.result) });
    };
    reader.readAsDataURL(f);
  }

  function update<K extends keyof CardTemplate>(k: K, v: CardTemplate[K]) {
    if (!tpl) return;
    setTpl({ ...tpl, [k]: v });
  }

  function onSave() {
    if (!tpl?.image) {
      toast.error("يرجى رفع صورة القالب أولاً");
      return;
    }
    saveTemplate(packageId, tpl);
    toast.success("تم حفظ القالب");
    onOpenChange(false);
  }

  function onDelete() {
    clearTemplate(packageId);
    setTpl(null);
    toast.success("تم حذف القالب");
  }

  function moveByPointer(e: React.PointerEvent) {
    if (!dragging || !previewRef.current || !tpl) return;
    const rect = previewRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setTpl({
      ...tpl,
      codeX: Math.max(0, Math.min(100 - tpl.codeWidth, x - tpl.codeWidth / 2)),
      codeY: Math.max(0, Math.min(100 - tpl.codeHeight, y - tpl.codeHeight / 2)),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>قالب طباعة الكروت — {packageName}</DialogTitle>
          <DialogDescription>
            ارفع صورة القالب ثم اسحب مربع رمز الدخول لضبط موضعه، وعدّل حجم الخط واللون.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => fileRef.current?.click()} className="rounded-xl">
              <Upload className="h-4 w-4 ml-1" /> {tpl?.image ? "استبدال الصورة" : "رفع صورة القالب"}
            </Button>
            {tpl?.image && (
              <Button variant="outline" onClick={onDelete} className="rounded-xl text-destructive">
                <Trash2 className="h-4 w-4 ml-1" /> حذف القالب
              </Button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
          </div>

          {tpl?.image ? (
            <>
              <div
                ref={previewRef}
                className="relative w-full border-2 border-dashed border-border rounded-lg overflow-hidden select-none touch-none"
                onPointerDown={(e) => { setDragging(true); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); moveByPointer(e); }}
                onPointerMove={moveByPointer}
                onPointerUp={() => setDragging(false)}
                onPointerCancel={() => setDragging(false)}
              >
                <img src={tpl.image} alt="template" className="w-full h-auto block pointer-events-none" />
                <div
                  className="absolute border-2 border-primary/70 bg-primary/5 flex items-center justify-center pointer-events-none"
                  style={{
                    left: `${tpl.codeX}%`,
                    top: `${tpl.codeY}%`,
                    width: `${tpl.codeWidth}%`,
                    height: `${tpl.codeHeight}%`,
                    color: tpl.fontColor,
                    fontWeight: tpl.fontWeight,
                    fontFamily: '"Arial Black", Arial, sans-serif',
                    fontSize: `clamp(10px, ${tpl.fontSize / 12}vw, ${tpl.fontSize}px)`,
                    letterSpacing: "2px",
                    direction: "ltr",
                    whiteSpace: "nowrap",
                  }}
                >
                  {sampleCode}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <NumField label="عرض المربع %" v={tpl.codeWidth} onChange={(n) => update("codeWidth", n)} min={5} max={100} />
                <NumField label="ارتفاع المربع %" v={tpl.codeHeight} onChange={(n) => update("codeHeight", n)} min={3} max={100} />
                <NumField label="حجم الخط px" v={tpl.fontSize} onChange={(n) => update("fontSize", n)} min={10} max={120} />
                <NumField label="سماكة الخط" v={tpl.fontWeight} onChange={(n) => update("fontWeight", n)} min={100} max={900} step={100} />
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs">لون النص</Label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={tpl.fontColor}
                      onChange={(e) => update("fontColor", e.target.value)}
                      className="h-10 w-16 rounded border"
                    />
                    <Input
                      value={tpl.fontColor}
                      onChange={(e) => update("fontColor", e.target.value)}
                      className="rounded-xl"
                    />
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                💡 يمكنك السحب على الصورة لتحريك موقع الرمز.
              </p>
            </>
          ) : (
            <div className="rounded-lg border-2 border-dashed border-border p-8 text-center text-muted-foreground text-sm">
              لم يتم رفع صورة قالب بعد.
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">إلغاء</Button>
          <Button onClick={onSave} className="rounded-xl gradient-primary-bg border-0">حفظ القالب</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NumField({ label, v, onChange, min, max, step = 1 }: {
  label: string; v: number; onChange: (n: number) => void; min: number; max: number; step?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        value={v}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-xl"
      />
    </div>
  );
}
