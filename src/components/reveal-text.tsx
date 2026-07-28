import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

function maskValue(v: string) {
  return "•".repeat(Math.max(4, Math.min(10, v.length)));
}

export function RevealText({
  username,
  password,
  className = "",
}: {
  username: string | null | undefined;
  password?: string | null | undefined;
  className?: string;
}) {
  const [shown, setShown] = useState(false);
  if (!username) return <>—</>;
  const full = password ? `${username} / ${password}` : username;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setShown((s) => !s);
      }}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 bg-muted/60 hover:bg-muted font-mono text-xs ${className}`}
      title={shown ? "إخفاء" : "إظهار"}
    >
      {shown ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
      <span>{shown ? full : maskValue(username)}</span>
    </button>
  );
}
