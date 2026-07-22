import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

/**
 * تنبيهات صوتية + إشعارات فورية:
 * - للمدير: عند وصول طلب سحب جديد
 * - للمندوب: عند اعتماد/رفض طلبه
 */
type Tone = "new" | "approve" | "reject";

function playTone(kind: Tone) {
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx: AudioContext = new AC();
    const play = (freq: number, start: number, dur: number, type: OscillatorType = "sine") => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
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
    if (kind === "new") {
      // دينج-دونج
      play(880, 0, 0.18);
      play(660, 0.2, 0.22);
      setTimeout(() => ctx.close().catch(() => {}), 700);
    } else if (kind === "approve") {
      // نغمة صاعدة مبهجة (قبول)
      play(660, 0, 0.14);
      play(880, 0.14, 0.14);
      play(1175, 0.28, 0.22);
      setTimeout(() => ctx.close().catch(() => {}), 900);
    } else {
      // نغمة هابطة خشنة (رفض)
      play(420, 0, 0.22, "square");
      play(260, 0.24, 0.32, "square");
      setTimeout(() => ctx.close().catch(() => {}), 900);
    }
  } catch {
    // ignore
  }
}

async function nativeVibrate(pattern: number[] = [120, 60, 120]) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      (navigator as any).vibrate?.(pattern);
    }
  } catch {
    // ignore
  }
}

export function useRequestNotifications() {
  const { profile, role, user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const networkId = profile?.network_id ?? null;
  const userId = user?.id ?? null;
  const seenAdmin = useRef<Set<string>>(new Set());
  const seenAgent = useRef<Map<string, string>>(new Map());

  // Admin: طلبات جديدة
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
          if (!id || seenAdmin.current.has(id)) return;
          seenAdmin.current.add(id);

          const agent = row?.agent_username ?? "مندوب";
          const pkg = row?.package_name ?? "باقة";
          const qty = row?.quantity ?? "";

          playTone("new");
          void nativeVibrate();

          toast.success(`طلب سحب جديد — ${agent}`, {
            description: `${pkg} · الكمية: ${qty}`,
            duration: 2000,
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

  // Agent: قبول/رفض الطلب
  useEffect(() => {
    if (role !== "agent" || !userId) return;

    const channel = supabase
      .channel(`agent-card-requests-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "card_requests",
          filter: `agent_id=eq.${userId}`,
        },
        (payload: any) => {
          const row = payload?.new;
          const id = row?.id as string | undefined;
          const status = row?.status as string | undefined;
          if (!id || !status) return;
          if (status !== "APPROVED" && status !== "REJECTED") return;
          if (seenAgent.current.get(id) === status) return;
          seenAgent.current.set(id, status);

          const pkg = row?.package_name ?? "باقة";
          const qty = row?.approved_quantity ?? row?.quantity ?? "";

          if (status === "APPROVED") {
            playTone("approve");
            void nativeVibrate([80, 40, 80]);
            toast.success("تم قبول طلبك ✅", {
              description: `${pkg} · الكمية: ${qty}`,
              duration: 2500,
              action: { label: "عرض", onClick: () => navigate({ to: "/app/cabin" }) },
            });
          } else {
            playTone("reject");
            void nativeVibrate([200, 80, 200]);
            toast.error("تم رفض طلبك ❌", {
              description: row?.reject_reason
                ? `السبب: ${row.reject_reason}`
                : `${pkg} · الكمية: ${qty}`,
              duration: 3000,
              action: { label: "عرض", onClick: () => navigate({ to: "/app/requests" }) },
            });
          }

          qc.invalidateQueries({ queryKey: ["card-requests"] });
          qc.invalidateQueries({ queryKey: ["requests"] });
          qc.invalidateQueries({ queryKey: ["agent-cabin"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [role, userId, navigate, qc]);
}
