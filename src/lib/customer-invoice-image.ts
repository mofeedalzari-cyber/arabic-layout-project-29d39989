// Builds the customer invoice as a PDF and shares it (cleaner than images):
// - Native: writes the PDF to Cache and opens the share sheet with the caption.
// - Web: downloads the PDF then opens WhatsApp with the text.
import { buildCustomerInvoicePdfBlob, type CustomerInvoiceInput } from "./customer-invoice-pdf";
import { openWhatsApp } from "./wa-open";

function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  // @ts-ignore
  return !!(window as any).Capacitor?.isNativePlatform?.();
}

function safeFileName(name: string): string {
  return (
    name
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\s+/g, "_")
      .slice(0, 80) || "invoice"
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    r.onload = () => {
      const s = String(r.result || "");
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.readAsDataURL(blob);
  });
}

/**
 * Build the invoice PDF + text and send via WhatsApp.
 * - Native: share sheet with the PDF file + caption.
 * - Web: download the PDF then open wa.me with text.
 */
export async function shareInvoiceImageOnWhatsApp(opts: {
  invoice: CustomerInvoiceInput;
  message: string;
  whatsappPhone?: string;
  filenameBase: string;
}): Promise<void> {
  const { invoice, message, whatsappPhone, filenameBase } = opts;

  const pdfBlob = await buildCustomerInvoicePdfBlob(invoice);
  const baseName = safeFileName(filenameBase);
  const stamp = Date.now();

  if (!isNativeApp()) {
    try {
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${baseName}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      console.error("[shareInvoiceOnWhatsApp] web download failed:", err);
    }
    if (whatsappPhone) await openWhatsApp(whatsappPhone, message);
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let Filesystem: any, Directory: any, Share: any;
  try {
    const [fsMod, shareMod] = await Promise.all([
      import("@capacitor/filesystem"),
      import("@capacitor/share"),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Filesystem = (fsMod as any).Filesystem;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Directory = (fsMod as any).Directory;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Share = (shareMod as any).Share;
  } catch (err) {
    console.error("[shareInvoiceOnWhatsApp] plugin import failed:", err);
    if (whatsappPhone) await openWhatsApp(whatsappPhone, message);
    return;
  }

  try {
    const base64 = await blobToBase64(pdfBlob);
    const written = await Filesystem.writeFile({
      path: `${baseName}_${stamp}.pdf`,
      data: base64,
      directory: Directory.Cache,
    });
    await Share.share({
      text: message,
      files: [written.uri],
      dialogTitle: whatsappPhone
        ? `إرسال كشف الحساب (PDF) عبر واتساب إلى +${String(whatsappPhone).replace(/\D/g, "")}`
        : "مشاركة كشف الحساب (PDF) عبر واتساب",
    });
  } catch (shareErr: any) {
    const msg = String(shareErr?.message || "");
    if (msg.includes("cancel") || msg.includes("dismiss")) return;
    console.error("[shareInvoiceOnWhatsApp] Share failed:", shareErr);
    if (whatsappPhone) await openWhatsApp(whatsappPhone, message);
  }
}
