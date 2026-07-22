import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

/**
 * تنبيه فوري + نغمة عند وصول طلب سحب جديد للمدير.
 * يستمع لجدول card_requests عبر Supabase Realtime، مقيداً بشبكة المدير.
 */
function playBeep() {
  try {
    const AC =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx: AudioContext = new AC();
    const play = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t0 = ctx.currentTime + start;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.35, t0 + 0.02);
      gain.gain.linearRampToValueAtTime(0, t0 + dur);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    };
    // نغمتان قصيرتان (دينج-دونج)
    play(880, 0, 0.18);
    play(660, 0.2, 0.22);
    setTimeout(() => ctx.close().catch(() => {}), 700);
  } catch {
    // ignore
  }
}

async function nativeVibrate() {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      (navigator as any).vibrate?.([120, 60, 120]);
    }
  } catch {
    // ignore
  }
}

export function useRequestNotifications() {
  const { profile, role } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const networkId = profile?.network_id ?? null;
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (role !== "admin" || !networkId) return;

    const channel = supabase
      .channel(`admin-card-requests-${networkId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "card_requests",
          filter: `network_id=eq.${networkId}`,
        },
        (payload: any) => {
          const row = payload?.new;
          const id = row?.id as string | undefined;
          if (!id || seen.current.has(id)) return;
          seen.current.add(id);

          const agent = row?.agent_username ?? "مندوب";
          const pkg = row?.package_name ?? "باقة";
          const qty = row?.quantity ?? "";

          playBeep();
          void nativeVibrate();

          toast.success(`طلب سحب جديد — ${agent}`, {
            description: `${pkg} · الكمية: ${qty}`,
            duration: 8000,
            action: {
              label: "عرض",
              onClick: () => navigate({ to: "/app/requests" }),
            },
          });

          qc.invalidateQueries({ queryKey: ["card-requests"] });
          qc.invalidateQueries({ queryKey: ["requests"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [role, networkId, navigate, qc]);
}
