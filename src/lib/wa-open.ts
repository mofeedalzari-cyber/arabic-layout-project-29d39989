// Open WhatsApp chat directly. On native (Capacitor), uses app URI schemes so the
// chosen WhatsApp app opens without going through a browser. On web, falls back
// to https://wa.me/.

export type WaApp = "auto" | "business" | "personal";

const WA_APP_KEY = "wa_app_preference";

export function getWaApp(): WaApp {
  if (typeof window === "undefined") return "auto";
  const v = window.localStorage.getItem(WA_APP_KEY);
  return v === "business" || v === "personal" ? v : "auto";
}

export function setWaApp(v: WaApp) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WA_APP_KEY, v);
}

export const WA_APP_LABELS: Record<WaApp, string> = {
  auto: "تلقائي (حسب المتوفر)",
  business: "واتساب الأعمال",
  personal: "واتساب الرسمي",
};

function isNative() {
  if (typeof window === "undefined") return false;
  return !!(window as any).Capacitor?.isNativePlatform?.();
}

export async function openWhatsApp(rawPhone: string, text?: string) {
  const phone = String(rawPhone ?? "").replace(/\D/g, "");
  if (!phone) return;
  const encoded = text ? encodeURIComponent(text) : "";
  const query = `phone=${phone}${encoded ? `&text=${encoded}` : ""}`;

  if (isNative()) {
    try {
      const { AppLauncher } = await import("@capacitor/app-launcher");

      // Android package-specific schemes; whatsapp:// is handled by whichever app is installed.
      const business = `whatsapp-business://send?${query}`;
      const personal = `whatsapp://send?${query}`;
      const pref = getWaApp();
      const candidates =
        pref === "business"
          ? [business, personal]
          : pref === "personal"
            ? [personal, business]
            : [personal, business];

      for (const url of candidates) {
        try {
          const { value: canOpen } = await AppLauncher.canOpenUrl({ url });
          if (canOpen) {
            await AppLauncher.openUrl({ url });
            return;
          }
        } catch {
          // try next candidate
        }
      }

      // Fallback: https://wa.me opens WhatsApp via intent on Android when installed
      await AppLauncher.openUrl({
        url: `https://wa.me/${phone}${encoded ? `?text=${encoded}` : ""}`,
      });
      return;
    } catch {
      // fall through to web
    }
  }

  window.open(`https://wa.me/${phone}${encoded ? `?text=${encoded}` : ""}`, "_blank");
}
