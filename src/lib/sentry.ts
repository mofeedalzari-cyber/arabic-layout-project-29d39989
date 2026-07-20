// Sentry initialization. No-op unless VITE_SENTRY_DSN is set.
// Also bridges Lovable's internal error hook so all errors reach Sentry.
import * as Sentry from "@sentry/react";

let initialized = false;

export function initSentry() {
  if (initialized || typeof window === "undefined") return;
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;

  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.1,
    environment: import.meta.env.MODE,
    // Helpful tag to filter Android WebView (Capacitor) issues quickly.
    initialScope: {
      tags: {
        platform: (window as any).Capacitor?.getPlatform?.() ?? "web",
        native: !!(window as any).Capacitor?.isNativePlatform?.(),
      },
    },
  });

  // Bridge Lovable error hook → Sentry (piggybacks on existing capture).
  const prev = (window as any).__lovableEvents ?? {};
  (window as any).__lovableEvents = {
    ...prev,
    captureException: (error: unknown, context?: Record<string, unknown>, options?: any) => {
      try {
        Sentry.captureException(error, { extra: context, tags: { mechanism: options?.mechanism } });
      } catch {}
      prev.captureException?.(error, context, options);
    },
  };

  initialized = true;
}

export function captureError(err: unknown, context?: Record<string, unknown>) {
  try {
    Sentry.captureException(err, { extra: context });
  } catch {}
  if (typeof console !== "undefined") console.error("[captureError]", err, context);
}

export function addBreadcrumb(message: string, data?: Record<string, unknown>) {
  try {
    Sentry.addBreadcrumb({ message, data, level: "info" });
  } catch {}
}
