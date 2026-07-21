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
async function htmlToPdfBlob(html: string, filename = "document.pdf"): Promise<Blob> {
  const html2pdf: any = (await import("html2pdf.js")).default;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = [
    "position:fixed",
    "left:0",
    "top:0",
    "width:210mm",
    "height:297mm",
    "border:0",
    "opacity:0",
    "pointer-events:none",
    "z-index:-1",
    "background:#fff",
  ].join(";");
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

  const originalReport = doc.body.querySelector<HTMLElement>('[data-pdf-report="true"], .page') ?? doc.body.firstElementChild;
  const reportClone = (originalReport?.cloneNode(true) as HTMLElement | null) ?? doc.createElement("div");
  if (!originalReport) reportClone.innerHTML = doc.body.innerHTML;

  const printContainer = doc.createElement("div");
  printContainer.id = "pdf-print-container";
  printContainer.setAttribute("dir", "rtl");
  printContainer.style.cssText = [
    "width:210mm",
    "min-height:297mm",
    "margin:0",
    "padding:15mm",
    "box-sizing:border-box",
    "background:white",
    "direction:rtl",
    "display:block",
    "overflow:visible",
    "position:relative",
    "transform:none",
    "scale:1",
    "zoom:1",
    "translate:none",
    "max-width:none",
  ].join(";");
  printContainer.appendChild(reportClone);

  const pdfLayout = doc.createElement("style");
  pdfLayout.textContent = `
    @page { size: A4 portrait; margin: 0; }
    html,
    body {
      width: 210mm !important;
      min-width: 210mm !important;
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
      direction: rtl !important;
      overflow: visible !important;
      transform: none !important;
      scale: 1 !important;
      zoom: 1 !important;
      translate: none !important;
    }
    #pdf-print-container {
      width: 210mm !important;
      min-height: 297mm !important;
      margin: 0 !important;
      padding: 15mm !important;
      box-sizing: border-box !important;
      background: #ffffff !important;
      direction: rtl !important;
      display: block !important;
      position: relative !important;
      overflow: visible !important;
      transform: none !important;
      scale: 1 !important;
      zoom: 1 !important;
      translate: none !important;
      max-width: none !important;
    }
    #pdf-print-container *,
    #pdf-print-container *::before,
    #pdf-print-container *::after {
      box-sizing: border-box !important;
      transform: none !important;
      scale: 1 !important;
      zoom: 1 !important;
      translate: none !important;
      max-width: none !important;
      overflow: visible !important;
    }
    #pdf-print-container [style*="position:absolute"],
    #pdf-print-container [style*="position: absolute"] {
      position: static !important;
    }
    #pdf-print-container [style*="fit-content"],
    #pdf-print-container [style*="inline-block"] {
      display: block !important;
      width: 100% !important;
    }
    #pdf-print-container .page,
    #pdf-print-container section,
    #pdf-print-container article,
    #pdf-print-container main,
    #pdf-print-container header,
    #pdf-print-container footer,
    #pdf-print-container .head,
    #pdf-print-container .head-row,
    #pdf-print-container .kpis,
    #pdf-print-container .kpi,
    #pdf-print-container .tbl-wrap,
    #pdf-print-container h1,
    #pdf-print-container h2,
    #pdf-print-container h3 {
      display: block !important;
      width: 100% !important;
      max-width: none !important;
      position: static !important;
      overflow: visible !important;
    }
    #pdf-print-container table {
      width: 100% !important;
      table-layout: fixed !important;
      border-collapse: collapse !important;
      page-break-inside: auto !important;
      break-inside: auto !important;
      direction: rtl !important;
    }
    #pdf-print-container thead { display: table-header-group !important; }
    #pdf-print-container tbody { display: table-row-group !important; }
    #pdf-print-container tr { page-break-inside: avoid !important; break-inside: avoid !important; }
    #pdf-print-container th,
    #pdf-print-container td {
      padding: 8px !important;
      border: 1px solid #cccccc !important;
      word-break: break-word !important;
      overflow-wrap: anywhere !important;
      white-space: normal !important;
      vertical-align: top !important;
    }
    #pdf-print-container img,
    #pdf-print-container svg,
    #pdf-print-container canvas {
      max-width: 100% !important;
      height: auto !important;
    }
  `;
  doc.head.appendChild(pdfLayout);

  doc.body.innerHTML = "";
  doc.body.appendChild(printContainer);

  normalizePdfPrintTree(printContainer);

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

  const source = printContainer;

  try {
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
      },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"] },
    };
    const blob: Blob = await withParentPdfSafeColors(() => html2pdf().set(opt).from(source).outputPdf("blob"));
    if (!blob || blob.size < 100) throw new Error("PDF blob is empty");
    return blob;
  } finally {
    printContainer.remove();
    iframe.remove();
  }
}

function normalizePdfPrintTree(root: HTMLElement) {
  const badProps = [
    "transform",
    "scale",
    "zoom",
    "max-width",
    "translate",
    "overflow",
    "overflow-x",
    "overflow-y",
    "position",
    "inset",
    "top",
    "right",
    "bottom",
    "left",
  ];

  Array.from(root.querySelectorAll<HTMLElement>("*")).forEach((el) => {
    for (const prop of badProps) el.style.removeProperty(prop);

    const inlineDisplay = el.style.getPropertyValue("display").trim().toLowerCase();
    const inlineWidth = el.style.getPropertyValue("width").trim().toLowerCase();
    if (inlineDisplay === "inline-block" || inlineWidth.includes("fit-content")) {
      el.style.setProperty("display", "block", "important");
      el.style.setProperty("width", "100%", "important");
    }

    if (el.matches(".page, section, article, main, header, footer, .head, .head-row, .kpis, .kpi, .tbl-wrap, h1, h2, h3")) {
      el.style.setProperty("display", "block", "important");
      el.style.setProperty("width", "100%", "important");
      el.style.setProperty("overflow", "visible", "important");
    }

    const tagName = el.tagName.toLowerCase();
    if (tagName === "table") {
      el.style.setProperty("width", "100%", "important");
      el.style.setProperty("table-layout", "fixed", "important");
      el.style.setProperty("border-collapse", "collapse", "important");
      el.style.setProperty("page-break-inside", "auto", "important");
    }

    if (tagName === "th" || tagName === "td") {
      el.style.setProperty("padding", "8px", "important");
      el.style.setProperty("border", "1px solid #cccccc", "important");
      el.style.setProperty("word-break", "break-word", "important");
      el.style.setProperty("white-space", "normal", "important");
    }
  });
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
