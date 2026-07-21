// Native/Web PDF generation & sharing helper.
// - On Android (Capacitor): render HTML → PDF (html2pdf.js) → save via Filesystem
//   → open the native Share Sheet (WhatsApp / Print Service / Gmail / Drive / …).
// - On Web: keep existing behaviour — open a new tab that auto-triggers print/save.

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  // @ts-ignore
  return !!(window as any).Capacitor?.isNativePlatform?.();
}

function safeFileName(name: string): string {
  return (
    name
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\s+/g, "_")
      .slice(0, 80) || "document"
  );
}

/**
 * Open a PDF Blob in a new browser tab (native browser PDF viewer with
 * built-in Print / Save buttons). Falls back to the HTML print flow if
 * the browser blocks the tab or Blob URL creation fails.
 */
function openPdfBlobInNewTab(blob: Blob, filename: string): boolean {
  try {
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    if (!w) {
      // popup blocked → fall back to <a> download-like open using anchor click
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
      a.setAttribute("aria-label", filename);
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    // Revoke later so the tab has time to load.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  } catch (err) {
    console.error("[openPdfBlobInNewTab] failed:", err);
    return false;
  }
}

/**
 * Web fallback: open the HTML in a new tab with a visible print toolbar.
 * Used only when PDF rendering fails.
 */
function openHtmlForPrintWeb(html: string) {
  try {
    const w = window.open("", "_blank");
    if (!w) {
      alert("يرجى السماح بالنوافذ المنبثقة لعرض الملف");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  } catch (err) {
    console.error("[openHtmlForPrintWeb] failed:", err);
    alert("حدث خطأ في فتح نافذة الطباعة، يرجى المحاولة مجدداً");
  }
}

/**
 * Render the given HTML string into a PDF Blob using html2pdf.js.
 * Rendered off-screen inside a hidden container.
 */
async function htmlToPdfBlob(html: string): Promise<Blob> {
  const html2pdf: any = (await import("html2pdf.js")).default;

  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const inner = bodyMatch ? bodyMatch[1] : html;
  const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
  const styles = styleMatch ? styleMatch.join("\n") : "";

  // Render inside a real on-screen (but invisible) container so Android WebView
  // gives html2canvas non-zero dimensions.
  const container = document.createElement("div");
  container.setAttribute("dir", "rtl");
  container.style.cssText =
    "position:fixed;left:0;top:0;width:800px;min-height:1000px;z-index:-1;opacity:0;pointer-events:none;background:#fff;color:#111;font-family:Cairo,Tahoma,Arial,sans-serif;";
  container.innerHTML = styles + inner;
  document.body.appendChild(container);

  // Wait for images/fonts to load before rasterizing
  try {
    const imgs = Array.from(container.querySelectorAll("img"));
    await Promise.all(
      imgs.map((img) =>
        img.complete ? null : new Promise((r) => { img.onload = img.onerror = () => r(null); }),
      ),
    );
    if ((document as any).fonts?.ready) await (document as any).fonts.ready;
  } catch {}

  try {
    const opt = {
      margin: [8, 8, 8, 8],
      filename: "document.pdf",
      image: { type: "jpeg", quality: 0.95 },
      html2canvas: {
        scale: 1.5,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        logging: false,
      },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"] },
    };
    const blob: Blob = await html2pdf().set(opt).from(container).outputPdf("blob");
    if (!blob || blob.size < 100) throw new Error("PDF blob is empty");
    return blob;
  } finally {
    container.remove();
  }
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
 * Generate a PDF from HTML and open the native Android Share Sheet,
 * or fall back to browser print on the web.
 *
 * @param html        Full HTML document (with <html><head><style></style></head><body>…</body></html>).
 * @param filename    Human filename (without extension). E.g. "كشف_حساب_المندوب".
 * @param dialogTitle Title of the share sheet.
 */
export async function sharePdfOrPrint(opts: {
  html: string;
  filename: string;
  dialogTitle?: string;
}) {
  const { html, filename, dialogTitle } = opts;

  // ============ WEB ============
  // Generate a real PDF and open it in a new tab so the browser's built-in
  // PDF viewer shows it (with Print / Save / Zoom controls) — instead of
  // silently downloading a file.
  if (!isNativeApp()) {
    try {
      const blob = await htmlToPdfBlob(html);
      const ok = openPdfBlobInNewTab(blob, filename);
      if (!ok) openHtmlForPrintWeb(html);
    } catch (err) {
      console.error("[sharePdfOrPrint web] PDF generation failed:", err);
      openHtmlForPrintWeb(html);
    }
    return;
  }

  // ============ NATIVE ANDROID (Capacitor) ============
  // نحاول: توليد PDF ثم مشاركة. لو فشل توليد PDF (بسبب oklch/الخطوط في
  // WebView)، نشارك الملف كـ HTML — WhatsApp/Drive/Gmail يقبلونه.
  let Filesystem: any, Directory: any, Share: any;
  try {
    const [fsMod, shareMod] = await Promise.all([
      import("@capacitor/filesystem"),
      import("@capacitor/share"),
    ]);
    Filesystem = (fsMod as any).Filesystem;
    Directory = (fsMod as any).Directory;
    Share = (shareMod as any).Share;
  } catch (err) {
    console.error("[sharePdfOrPrint] plugin import failed:", err);
    alert("تعذر تحميل مكونات المشاركة");
    return;
  }

  let fileName = `${safeFileName(filename)}_${Date.now()}.pdf`;
  let base64 = "";
  let mimeType = "application/pdf";

  try {
    const blob = await htmlToPdfBlob(html);
    base64 = await blobToBase64(blob);
  } catch (pdfErr) {
    console.error("[sharePdfOrPrint] PDF render failed, falling back to HTML:", pdfErr);
    // Fallback: share as .html so the user still gets the file
    try {
      const htmlBlob = new Blob([html], { type: "text/html;charset=utf-8" });
      base64 = await blobToBase64(htmlBlob);
      fileName = `${safeFileName(filename)}_${Date.now()}.html`;
      mimeType = "text/html";
    } catch (fbErr) {
      console.error("[sharePdfOrPrint] HTML fallback failed:", fbErr);
      alert("تعذر تحضير الملف: " + (String((pdfErr as any)?.message || pdfErr).slice(0, 120)));
      return;
    }
  }

  let fileUri = "";
  try {
    const written = await Filesystem.writeFile({
      path: fileName,
      data: base64,
      directory: Directory.Cache,
    });
    fileUri = written.uri;
  } catch (wErr) {
    console.error("[sharePdfOrPrint] writeFile failed:", wErr);
    alert("تعذر حفظ الملف مؤقتاً");
    return;
  }

  try {
    await Share.share({
      title: dialogTitle || filename,
      text: filename,
      url: fileUri,
      dialogTitle: dialogTitle || "مشاركة هذا الملف",
    });
  } catch (shareErr: any) {
    const msg = String(shareErr?.message || "");
    if (msg.includes("cancel") || msg.includes("dismiss")) return;
    console.error("[sharePdfOrPrint] Share failed:", shareErr);
    alert("تعذر فتح نافذة المشاركة: " + msg.slice(0, 120));
  }
}