import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * يحافظ على اتصال التحديث الفوري (Realtime) حيًّا.
 *
 * المشكلة: عندما يُغلق الهاتف الشاشة أو يضع التطبيق في الخلفية، يُقتل اتصال
 * الويب سوكت بصمت، فلا تصل الأحداث (ولا الإشعارات) إلا بعد إعادة تشغيل
 * الإنترنت. هذا الخُطّاف يعيد الاتصال تلقائيًا عند:
 * - عودة الإنترنت (online)
 * - عودة التطبيق للمقدمة (visibilitychange / Capacitor resume)
 * - كل 25 ثانية إذا كانت القنوات غير متصلة
 */
export function useRealtimeKeepAlive() {
  const qc = useQueryClient();

  useEffect(() => {
    if (typeof window === "undefined") return;
    let disposed = false;

    const reconnect = (force = false) => {
      if (disposed) return;
      try {
        const rt: any = (supabase as any).realtime;
        const channels = supabase.getChannels();
        const healthy =
          rt?.isConnected?.() && channels.every((c: any) => c.state === "joined");
        if (!healthy || force) {
          rt?.disconnect?.();
          rt?.connect?.();
          channels.forEach((c: any) => {
            try {
              if (c.state !== "joined") c.subscribe();
            } catch {
              /* ignore */
            }
          });
        }
      } catch {
        /* ignore */
      }
      // إعادة جلب البيانات المعروضة حاليًا لتعويض ما فُقد أثناء الانقطاع
      qc.invalidateQueries({ refetchType: "active" });
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") reconnect(true);
    };

    window.addEventListener("online", () => reconnect(true));
    document.addEventListener("visibilitychange", onVisible);

    const timer = setInterval(() => {
      if (document.visibilityState === "visible") reconnect(false);
    }, 25_000);

    let removeAppListener: (() => void) | undefined;
    void (async () => {
      try {
        if (!(window as any).Capacitor?.isNativePlatform?.()) return;
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) reconnect(true);
        });
        removeAppListener = () => void handle.remove();
      } catch {
        /* ignore */
      }
    })();

    return () => {
      disposed = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      removeAppListener?.();
    };
  }, [qc]);
}
