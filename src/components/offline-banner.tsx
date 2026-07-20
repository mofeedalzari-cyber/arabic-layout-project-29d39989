import { useEffect, useState } from "react";

/**
 * Shows a small banner when the device is offline.
 * Helpful inside the Android WebView (Capacitor) when network is weak.
 */
export function OfflineBanner() {
  const [online, setOnline] = useState<boolean>(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (online) return null;

  return (
    <div
      dir="rtl"
      className="fixed inset-x-0 top-0 z-[9999] bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-white shadow-md"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.5rem)" }}
      role="status"
      aria-live="polite"
    >
      لا يوجد اتصال بالإنترنت — سيتم إعادة المحاولة تلقائياً عند عودة الاتصال
    </div>
  );
}
