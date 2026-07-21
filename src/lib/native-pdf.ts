// native-pdf.ts
// Native/Web PDF generation & sharing helper.

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

function openPdfBlobInNewTab(blob: Blob, filename: string): boolean {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeFileName(filename)}.pdf`;
    a.rel = "noopener";
    a.setAttribute("aria-label", filename);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  } catch (err) {
    console.error("[openPdfBlobInNewTab] failed:", err);
    return false;
  }
}

/**
 * Open an HTML document for the user to preview / print — without going through
 * html2pdf.js (which can freeze the app on large or oklch-styled pages).
 * The HTML should include its own `window.print()` call to auto-open the dialog.
 *
 *  - Web: opens a blob URL in a new tab; the browser's native print dialog runs.
 *  - Native (Capacitor): writes an .html file to Cache and opens the system
 *    Share sheet so the user can print / preview / share via any installed app.
 */
export async function openHtmlForPrint(opts: {
  html: string;
  filename: string;
  dialogTitle?: string;
}): Promise<void> {
  const { html, filename, dialogTitle } = opts;

  if (!isNativeApp()) {
    try {
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank");
      if (!win) {
        // Popup blocked — fall back to downloading the file.
        const a = document.createElement("a");
        a.href = url;
        a.download = `${safeFileName(filename)}.html`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      console.error("[openHtmlForPrint] web open failed:", err);
      alert("تعذر فتح نافذة الطباعة");
    }
    return;
  }

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
    console.error("[openHtmlForPrint] plugin import failed:", err);
    alert("تعذر تحميل مكونات المشاركة");
    return;
  }

  const fileName = `${safeFileName(filename)}_${Date.now()}.html`;
  try {
    const written = await Filesystem.writeFile({
      path: fileName,
      data: html,
      directory: Directory.Cache,
      encoding: "utf8",
    });
    await Share.share({
      title: dialogTitle || filename,
      text: filename,
      url: written.uri,
      dialogTitle: dialogTitle || "فتح أو مشاركة الملف للطباعة",
    });
  } catch (shareErr: any) {
    const msg = String(shareErr?.message || "");
    if (msg.includes("cancel") || msg.includes("dismiss")) return;
    console.error("[openHtmlForPrint] native failed:", shareErr);
    alert("تعذر فتح نافذة الطباعة: " + msg.slice(0, 120));
  }
}

/**
 * Render the given HTML string into a PDF Blob using html2pdf.js.
 * Renders inside an isolated iframe, preserving the report's own styles.
 */
async function htmlToPdfBlob(html: string, filename = "document.pdf"): Promise<Blob> {
  const html2pdf: any = (await import("html2pdf.js")).default;

  // Isolated iframe so the report's global CSS does not leak into the app.
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = `
    position:fixed; left:0; top:0;
    width:210mm; height:297mm;
    border:0; opacity:0; pointer-events:none; z-index:-1; background:#fff;
  `;
  document.body.appendChild(iframe);

  await new Promise<void>((resolve) => {
    iframe.onload = () => resolve();
    setTimeout(() => resolve(), 50);
  });

  // Replace any modern CSS color functions html2canvas cannot parse
  // (oklch / oklab / lch / lab / color-mix) with a safe fallback color.
  const stripUnsupportedColors = (src: string): string =>
    src
      .replace(/\bcolor-mix\s*\([^)]*\)/gi, "#111827")
      .replace(/\boklch\s*\([^)]*\)/gi, "#111827")
      .replace(/\boklab\s*\([^)]*\)/gi, "#111827")
      .replace(/\blch\s*\([^)]*\)/gi, "#111827")
      .replace(/\blab\s*\([^)]*\)/gi, "#111827");

  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(stripUnsupportedColors(html));
  doc.close();

  // Prefer the report root the caller marked; fall back to the `.page` wrapper
  // convention used by our HTML reports, then to <body>.
  const reportRoot =
    doc.body.querySelector<HTMLElement>('[data-pdf-report="true"]') ??
    doc.body.querySelector<HTMLElement>('.page') ??
    doc.body;

  // Wait for fonts and images so html2canvas snapshots a fully painted layout.
  try {
    const imgs = Array.from(doc.querySelectorAll("img"));
    await Promise.all(
      imgs.map((img) =>
        (img as HTMLImageElement).complete
          ? null
          : new Promise((r) => {
              (img as HTMLImageElement).onload = () => r(null);
              (img as HTMLImageElement).onerror = () => r(null);
            }),
      ),
    );
    if ((doc as any).fonts?.ready) await (doc as any).fonts.ready;
  } catch {}

  const opt = {
    margin: 0,
    filename,
    image: { type: "jpeg", quality: 1 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      scrollX: 0,
      scrollY: 0,
      windowWidth: reportRoot.scrollWidth || 794,
    },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    pagebreak: { mode: ["css", "legacy"] },
  };

  let blob: Blob;
  try {
    const worker = html2pdf().set(opt).from(reportRoot).toPdf();
    const pdf: any = await worker.get("pdf");

    // Page numbers + timestamp on every page.
    try {
      const pageCount = pdf.internal.getNumberOfPages();
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const stamp = new Date().toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" });
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(120, 120, 120);
      for (let i = 1; i <= pageCount; i++) {
        pdf.setPage(i);
        pdf.text(`صفحة ${i} / ${pageCount}`, pageWidth / 2, pageHeight - 6, { align: "center" });
        pdf.text(stamp, pageWidth - 8, pageHeight - 6, { align: "right" });
        pdf.text("© كرتي", 8, pageHeight - 6, { align: "left" });
      }
    } catch (stampErr) {
      console.warn("[htmlToPdfBlob] page-number stamping skipped:", stampErr);
    }

    blob = pdf.output("blob") as Blob;
  } finally {
    iframe.remove();
  }

  if (!blob || blob.size < 100) throw new Error("PDF blob is empty");
  return blob;
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
 * or open it in the browser's PDF viewer on the web.
 */
export async function sharePdfOrPrint(opts: {
  html: string;
  filename: string;
  dialogTitle?: string;
}) {
  const { html, filename, dialogTitle } = opts;
  const blob = await htmlToPdfBlob(html);
  await sharePdfBlob({ blob, filename, dialogTitle });
}

/**
 * Share (native) or open (web) a pre-generated PDF blob.
 */
export async function sharePdfBlob(opts: {
  blob: Blob;
  filename: string;
  dialogTitle?: string;
}) {
  const { blob, filename, dialogTitle } = opts;

  if (!isNativeApp()) {
    openPdfBlobInNewTab(blob, filename);
    return;
  }

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
    console.error("[sharePdfBlob] plugin import failed:", err);
    alert("تعذر تحميل مكونات المشاركة");
    return;
  }

  const fileName = `${safeFileName(filename)}_${Date.now()}.pdf`;
  let base64 = "";
  try {
    base64 = await blobToBase64(blob);
  } catch (err) {
    console.error("[sharePdfBlob] base64 conversion failed:", err);
    alert("تعذر تجهيز الملف للمشاركة");
    return;
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
    console.error("[sharePdfBlob] writeFile failed:", wErr);
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
    console.error("[sharePdfBlob] Share failed:", shareErr);
    alert("تعذر فتح نافذة المشاركة: " + msg.slice(0, 120));
  }
}

/**
 * Save a Blob to the device.
 *  - Web: triggers a browser download.
 *  - Native (Android): writes to the public Downloads folder
 *    (/storage/emulated/0/Download). Falls back to Documents, then to
 *    the Share sheet if direct save fails.
 */
export async function saveBlobToDevice(opts: {
  blob: Blob;
  filename: string; // must include extension
  mimeType?: string;
  dialogTitle?: string;
}): Promise<{ savedTo?: string; shared?: boolean }> {
  const { blob, filename, dialogTitle } = opts;

  if (!isNativeApp()) {
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return { savedTo: filename };
    } catch (err) {
      console.error("[saveBlobToDevice] web download failed:", err);
      throw err;
    }
  }

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
    console.error("[saveBlobToDevice] plugin import failed:", err);
    throw err;
  }

  const base64 = await blobToBase64(blob);

  // Try public Downloads first (Android): ExternalStorage/Download/<file>
  const attempts: Array<{ path: string; directory: any; label: string }> = [
    { path: `Download/${filename}`, directory: Directory.ExternalStorage, label: "التنزيلات" },
    { path: filename, directory: Directory.Documents, label: "المستندات" },
  ];

  for (const attempt of attempts) {
    try {
      const written = await Filesystem.writeFile({
        path: attempt.path,
        data: base64,
        directory: attempt.directory,
        recursive: true,
      });
      return { savedTo: written.uri || attempt.label };
    } catch (err) {
      console.warn(`[saveBlobToDevice] ${attempt.label} failed:`, err);
    }
  }

  // Final fallback: write to Cache and open Share sheet so the user can
  // pick "Save to device" from the system dialog.
  try {
    const written = await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Cache,
    });
    await Share.share({
      title: dialogTitle || filename,
      text: filename,
      url: written.uri,
      dialogTitle: dialogTitle || "حفظ الملف",
    });
    return { shared: true };
  } catch (err: any) {
    const msg = String(err?.message || "");
    if (msg.includes("cancel") || msg.includes("dismiss")) return { shared: true };
    console.error("[saveBlobToDevice] share fallback failed:", err);
    throw err;
  }
}
