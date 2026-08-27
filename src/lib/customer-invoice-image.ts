// Renders the customer invoice PDF's first page to a PNG blob, then shares it
// via the native share sheet (with the message as caption) on Capacitor, or
// downloads + opens WhatsApp on the web.
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

/** Render each PDF page to its own PNG Blob (one image per page). */
async function pdfBlobToPngBlobs(pdfBlob: Blob, scale = 2): Promise<Blob[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs: any = await import("pdfjs-dist");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const workerMod: any = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default;

  const buf = await pdfBlob.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;

  const blobs: Blob[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png", 0.95),
    );
    blobs.push(blob);
  }
  return blobs;
}


/**
 * Build the invoice image + text and send via WhatsApp.
 * - Native: share sheet with PNG file + caption (user picks WhatsApp, message pre-filled).
 * - Web: download PNG then open wa.me with text.
 */
export async function shareInvoiceImageOnWhatsApp(opts: {
  invoice: CustomerInvoiceInput;
  message: string;
  whatsappPhone?: string;
  filenameBase: string;
}): Promise<void> {
  const { invoice, message, whatsappPhone, filenameBase } = opts;

  const pdfBlob = await buildCustomerInvoicePdfBlob(invoice);
  const pngBlobs = await pdfBlobToPngBlobs(pdfBlob, 2);

  const baseName = safeFileName(filenameBase);
  const stamp = Date.now();
  const multi = pngBlobs.length > 1;

  if (!isNativeApp()) {
    // Web: download each page as a separate image, then open WhatsApp.
    pngBlobs.forEach((blob, idx) => {
      try {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = multi ? `${baseName}_${idx + 1}.png` : `${baseName}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } catch (err) {
        console.error("[shareInvoiceImageOnWhatsApp] web download failed:", err);
      }
    });
    if (whatsappPhone) await openWhatsApp(whatsappPhone, message);
    return;
  }

  // Native: write PNG to Cache and open the Share sheet with the caption text.
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
    console.error("[shareInvoiceImageOnWhatsApp] plugin import failed:", err);
    if (whatsappPhone) await openWhatsApp(whatsappPhone, message);
    return;
  }

  try {
    const uris: string[] = [];
    for (let i = 0; i < pngBlobs.length; i++) {
      const base64 = await blobToBase64(pngBlobs[i]);
      const written = await Filesystem.writeFile({
        path: multi ? `${baseName}_${stamp}_${i + 1}.png` : `${baseName}_${stamp}.png`,
        data: base64,
        directory: Directory.Cache,
      });
      uris.push(written.uri);
    }
    // Share the images with caption. On Android, `files[]` reliably attaches
    // the images; when the user picks WhatsApp the caption is prefilled.
    await Share.share({
      text: message,
      files: uris,
      dialogTitle: whatsappPhone
        ? `إرسال كشف الحساب عبر واتساب إلى +${String(whatsappPhone).replace(/\D/g, "")}`
        : "مشاركة كشف الحساب عبر واتساب",
    });
  } catch (shareErr: any) {
    const msg = String(shareErr?.message || "");
    if (msg.includes("cancel") || msg.includes("dismiss")) return;
    console.error("[shareInvoiceImageOnWhatsApp] Share failed:", shareErr);
    // Fallback: open the customer's WhatsApp chat directly with the text.
    if (whatsappPhone) await openWhatsApp(whatsappPhone, message);
  }
}
