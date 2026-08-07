// مزامنة تلقائية خفية: عند عودة الإنترنت أو عند فتح التطبيق،
// تُرسل العمليات المؤجلة ثم تُحدَّث البيانات الظاهرة بهدوء (بدون أي واجهة).

import type { QueryClient } from "@tanstack/react-query";
import { flushQueue } from "./offline-queue";

let started = false;
let syncing = false;
let lastSync = 0;

async function runSync(qc: QueryClient, force = false) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  if (syncing) return;
  if (!force && Date.now() - lastSync < 15_000) return;
  syncing = true;
  try {
    await flushQueue();
    await qc.invalidateQueries({ refetchType: "active" });
    lastSync = Date.now();
  } catch {
    /* silent */
  } finally {
    syncing = false;
  }
}

/** يشغّل المزامنة الخفية (مرة واحدة لكل جلسة). */
export function initAutoSync(queryClient: QueryClient): () => void {
  if (typeof window === "undefined" || started) return () => {};
  started = true;

  const onOnline = () => void runSync(queryClient, true);
  const onVisible = () => {
    if (document.visibilityState === "visible") void runSync(queryClient);
  };

  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisible);
  // مزامنة دورية هادئة كل دقيقة عندما يكون التطبيق مفتوحاً
  const timer = window.setInterval(() => {
    if (document.visibilityState === "visible") void runSync(queryClient);
  }, 60_000);

  // مزامنة أولية بعد الإقلاع من الذاكرة المحلية
  window.setTimeout(() => void runSync(queryClient, true), 2000);

  return () => {
    started = false;
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisible);
    window.clearInterval(timer);
  };
}
