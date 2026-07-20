import { Card } from "@/components/ui/card";

export type MobileDataField = {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "primary" | "success" | "warning" | "danger";
};

export function MobileDataCard({
  title,
  fields,
  headerRight,
}: {
  title?: React.ReactNode;
  fields: MobileDataField[];
  headerRight?: React.ReactNode;
}) {
  return (
    <Card className="card-elegant border-0 p-3 w-full max-w-full">
      {(title || headerRight) && (
        <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-border/50">
          {title && <div className="min-w-0 font-bold text-sm [overflow-wrap:anywhere]">{title}</div>}
          {headerRight && <div className="shrink-0">{headerRight}</div>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        {fields.map((f, i) => {
          const toneClass =
            f.tone === "primary" ? "text-primary"
            : f.tone === "success" ? "text-success"
            : f.tone === "warning" ? "text-warning"
            : f.tone === "danger" ? "text-destructive"
            : "text-foreground";
          return (
            <div key={i} className="min-w-0">
              <div className="text-[11px] text-muted-foreground mb-0.5 [overflow-wrap:anywhere]">{f.label}</div>
              <div className={`text-sm font-bold [overflow-wrap:anywhere] ${toneClass}`}>{f.value}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
