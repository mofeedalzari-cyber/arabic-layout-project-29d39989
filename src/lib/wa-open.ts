// Open WhatsApp chat directly. On native (Capacitor), uses the whatsapp:// scheme
// so the WhatsApp app opens without going through a browser. On web, falls back
// to https://wa.me/.
function isNative() {
  if (typeof window === "undefined") return false;
  return !!(window as any).Capacitor?.isNativePlatform?.();
}

export async function openWhatsApp(rawPhone: string, text?: string) {
  const phone = String(rawPhone ?? "").replace(/\D/g, "");
  if (!phone) return;
  const encoded = text ? encodeURIComponent(text) : "";

  if (isNative()) {
    try {
      const { AppLauncher } = await import("@capacitor/app-launcher");
      // Prefer WhatsApp app URI
      const waUrl = `whatsapp://send?phone=${phone}${encoded ? `&text=${encoded}` : ""}`;
      const { value: canOpen } = await AppLauncher.canOpenUrl({ url: waUrl });
      if (canOpen) {
        await AppLauncher.openUrl({ url: waUrl });
        return;
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

  window.open(
    `https://wa.me/${phone}${encoded ? `?text=${encoded}` : ""}`,
    "_blank",
  );
}
