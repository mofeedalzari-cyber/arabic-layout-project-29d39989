// Share a receipt image together with a text message to WhatsApp.
// On native (Capacitor) the image file is attached through the share sheet so the
// admin receives the picture itself. On web we fall back to a wa.me chat with the
// message text (which includes a temporary link to the receipt image).

import { openWhatsApp } from "@/lib/wa-open";

function isNative() {
  if (typeof window === "undefined") return false;
  return !!(window as any).Capacitor?.isNativePlatform?.();
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("read_failed"));
    r.onload = () => {
      const s = String(r.result ?? "");
      resolve(s.includes(",") ? s.slice(s.indexOf(",") + 1) : s);
    };
    r.readAsDataURL(blob);
  });
}

/**
 * Sends `text` to WhatsApp, attaching `file` when the platform allows it.
 * Returns true when the image itself was attached.
 */
export async function shareReceiptToWhatsApp(
  phone: string,
  text: string,
  file: Blob | null,
  fileName = "receipt.jpg",
): Promise<boolean> {
  if (file && isNative()) {
    try {
      const [{ Filesystem, Directory }, { Share }] = await Promise.all([
        import("@capacitor/filesystem"),
        import("@capacitor/share"),
      ]);
      const data = await blobToBase64(file);
      const name = `wa-${Date.now()}-${fileName.replace(/[^\w.\-]/g, "_")}`;
      const w = await Filesystem.writeFile({
        path: name,
        data,
        directory: Directory.Cache,
      });
      await Share.share({ text, files: [w.uri], dialogTitle: "إرسال الإيصال عبر واتساب" });
      return true;
    } catch {
      // fall through to chat link
    }
  }

  if (phone) await openWhatsApp(phone, text);
  return false;
}
