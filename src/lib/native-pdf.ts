// Native/Web PDF generation & sharing helper.
// - On Android (Capacitor): render HTML → PDF (html2pdf.js) → save via Filesystem
//   → open the native Share Sheet (WhatsApp / Print Service / Gmail / Drive / …).
// - On Web: open a new tab with the browser's built-in PDF viewer.

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
 * built-in Print / Save buttons).
 */
function openPdfBlobInNewTab(blob: Blob, filename: string): boolean {
  try {
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    if (!w) {
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
      a.setAttribute("aria-label", filename);
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  } catch (err) {
    console.error("[openPdfBlobInNewTab] failed:", err);
    return false;
  }
}

const UNSUPPORTED_COLOR_RE = /\b(?:oklch|oklab|lch|lab|color-mix)\s*\(/i;

const PDF_SAFE_STYLE = `
  :root, html, body {
    --background: #ffffff;
    --foreground: #111827;
    --card: #ffffff;
    --card-foreground: #111827;
    --popover: #ffffff;
    --popover-foreground: #111827;
    --primary: #009688;
    --primary-foreground: #ffffff;
    --primary-glow: #14b8a6;
    --secondary: #f1f5f9;
    --secondary-foreground: #111827;
    --muted: #f1f5f9;
    --muted-foreground: #64748b;
    --accent: #e0f2f1;
    --accent-foreground: #0f766e;
    --destructive: #ef4444;
    --destructive-foreground: #ffffff;
    --success: #22c55e;
    --success-foreground: #ffffff;
    --warning: #f59e0b;
    --warning-foreground: #111827;
    --border: #d1d5db;
    --input: #e5e7eb;
    --ring: #009688;
    --sidebar: #ffffff;
    --sidebar-foreground: #111827;
    --sidebar-primary: #009688;
    --sidebar-primary-foreground: #ffffff;
    --sidebar-accent: #e0f2f1;
    --sidebar-accent-foreground: #0f766e;
    --sidebar-border: #d1d5db;
    --sidebar-ring: #009688;
    --color-background: #ffffff;
    --color-foreground: #111827;
    --color-card: #ffffff;
    --color-card-foreground: #111827;
    --color-popover: #ffffff;
    --color-popover-foreground: #111827;
    --color-primary: #009688;
    --color-primary-foreground: #ffffff;
    --color-secondary: #f1f5f9;
    --color-secondary-foreground: #111827;
    --color-muted: #f1f5f9;
    --color-muted-foreground: #64748b;
    --color-accent: #e0f2f1;
    --color-accent-foreground: #0f766e;
    --color-destructive: #ef4444;
    --color-destructive-foreground: #ffffff;
    --color-success: #22c55e;
    --color-success-foreground: #ffffff;
    --color-warning: #f59e0b;
    --color-warning-foreground: #111827;
    --color-border: #d1d5db;
    --color-input: #e5e7eb;
    --color-ring: #009688;
    --shadow-soft: none;
    --shadow-elegant: none;
    --shadow-glow: none;
    --gradient-primary: linear-gradient(135deg, #009688, #14b8a6);
    --gradient-surface: linear-gradient(180deg, #ffffff, #f8fafc);
  }
  html, body {
    background: #ffffff !important;
    color: #111827 !important;
    color-scheme: light !important;
  }
  *, *::before, *::after {
    color-scheme: light !important;
    box-shadow: none !important;
    text-shadow: none !important;
    outline-color: #111827 !important;
    text-decoration-color: currentColor !important;
    caret-color: #111827 !important;
  }
`;

function stripUnsupportedColorFunctions(value: string): string {
  return value
    .replace(/color-mix\(\s*in\s+(?:oklch|oklab|lch|lab)\s*,\s*(?:[^()]|\([^()]*\))*\)/gi, "#111827")
    .replace(/oklch\((?:[^()]|\([^()]*\))*\)/gi, "#111827")
    .replace(/oklab\((?:[^()]|\([^()]*\))*\)/gi, "#111827")
    .replace(/lch\((?:[^()]|\([^()]*\))*\)/gi, "#111827")
    .replace(/lab\((?:[^()]|\([^()]*\))*\)/gi, "#111827");
}

function fallbackColor(prop: string, el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (tag === "html" || tag === "body") return "#ffffff";
  if (prop.includes("background")) return "transparent";
  if (prop.includes("border") || prop.includes("outline") || prop.includes("column-rule")) return "#d1d5db";
  return "#111827";
}

function addPdfSafeStyle(doc: Document) {
  const style = doc.createElement("style");
  style.setAttribute("data-pdf-safe-colors", "true");
  style.textContent = PDF_SAFE_STYLE;
  doc.head.appendChild(style);
  return style;
}

function sanitizePdfDocument(doc: Document) {
  Array.from(doc.querySelectorAll("script")).forEach((script) => script.remove());
  Array.from(doc.querySelectorAll("style")).forEach((style) => {
    style.textContent = stripUnsupportedColorFunctions(style.textContent || "");
  });
  Array.from(doc.querySelectorAll<HTMLElement>("[style]")).forEach((el) => {
    const styleText = el.getAttribute("style") || "";
    if (UNSUPPORTED_COLOR_RE.test(styleText)) el.setAttribute("style", stripUnsupportedColorFunctions(styleText));
  });
  addPdfSafeStyle(doc);

  const win = doc.defaultView;
  if (!win) return;

  const colorProps = [
    "color",
    "background-color",
    "border-top-color",
    "border-right-color",
    "border-bottom-color",
    "border-left-color",
    "outline-color",
    "text-decoration-color",
    "column-rule-color",
    "caret-color",
    "fill",
    "stroke",
  ];
  const visualProps = ["background", "background-image", "box-shadow", "text-shadow", "filter"];

  Array.from(doc.querySelectorAll<HTMLElement>("html, body, body *")).forEach((el) => {
    const computed = win.getComputedStyle(el);
    for (const prop of colorProps) {
      const value = computed.getPropertyValue(prop);
      if (UNSUPPORTED_COLOR_RE.test(value)) el.style.setProperty(prop, fallbackColor(prop, el), "important");
    }
    for (const prop of visualProps) {
      const value = computed.getPropertyValue(prop);
      if (UNSUPPORTED_COLOR_RE.test(value)) {
        el.style.setProperty(prop, prop.startsWith("background") ? "none" : "none", "important");
      }
    }
  });
}

async function withParentPdfSafeColors<T>(task: () => Promise<T>): Promise<T> {
  if (typeof document === "undefined") return task();
  const style = addPdfSafeStyle(document);
  try {
    return await task();
  } finally {
    style.remove();
  }
}

/**
 * Render the given HTML string into a PDF Blob using html2pdf.js.
 * Rendered inside an ISOLATED iframe so the app's Tailwind v4 `oklch()`
 * color tokens don't leak in and crash html2canvas.
 */
async function htmlToPdfBlob(html: string): Promise<Blob> {
  const html2pdf: any = (await import("html2pdf.js")).default;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;left:0;top:0;width:800px;height:1200px;border:0;visibility:hidden;pointer-events:none;z-index:-1;background:#fff;";
  document.body.appendChild(iframe);

  await new Promise<void>((resolve) => {
    iframe.onload = () => resolve();
    setTimeout(() => resolve(), 50);
  });

  const doc = iframe.contentDocument!;
  doc.open();
  const sanitized = stripUnsupportedColorFunctions(html);
  doc.write(sanitized);
  doc.close();
  sanitizePdfDocument(doc);

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

  const source = doc.body;

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
        windowWidth: 800,
      },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"] },
    };
    const blob: Blob = await withParentPdfSafeColors(() => html2pdf().set(opt).from(source).outputPdf("blob"));
    if (!blob || blob.size < 100) throw new Error("PDF blob is empty");
    return blob;
  } finally {
    iframe.remove();
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
 * or open it in the browser's PDF viewer on the web.
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
  if (!isNativeApp()) {
    try {
      const blob = await htmlToPdfBlob(html);
      openPdfBlobInNewTab(blob, filename);
    } catch (err) {
      console.error("[sharePdfOrPrint web] PDF generation failed:", err);
      alert("تعذر توليد ملف PDF، يرجى المحاولة مجدداً");
    }
    return;
  }

  // ============ NATIVE ANDROID (Capacitor) ============
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

  const fileName = `${safeFileName(filename)}_${Date.now()}.pdf`;
  let base64 = "";

  try {
    const blob = await htmlToPdfBlob(html);
    base64 = await blobToBase64(blob);
  } catch (pdfErr) {
    console.error("[sharePdfOrPrint] PDF render failed:", pdfErr);
    alert("تعذر توليد ملف PDF: " + (String((pdfErr as any)?.message || pdfErr).slice(0, 120)));
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
