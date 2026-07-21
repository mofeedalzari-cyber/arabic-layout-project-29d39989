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

/**
 * Render the given HTML string into a PDF Blob using html2pdf.js.
 * Rendered inside an ISOLATED iframe.
 */
async function htmlToPdfBlob(html: string, filename = "document.pdf"): Promise<Blob> {
  const html2pdf: any = (await import("html2pdf.js")).default;

  // إنشاء iframe معزول
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = `
    position:fixed;
    left:0; top:0;
    width:210mm;
    height:297mm;
    border:0;
    opacity:0;
    pointer-events:none;
    z-index:-1;
    background:#fff;
  `;
  document.body.appendChild(iframe);

  await new Promise<void>((resolve) => {
    iframe.onload = () => resolve();
    setTimeout(() => resolve(), 50);
  });

  const doc = iframe.contentDocument!;
  doc.open();

  // ================================================================
  // 1. تنظيف HTML من جميع دوال الألوان غير المدعومة
  // ================================================================
  let cleanedHtml = html;
  // استبدال الدوال الكاملة
  cleanedHtml = cleanedHtml.replace(/\bcolor-mix\s*\([^)]*\)/gi, "#111827");
  cleanedHtml = cleanedHtml.replace(/\boklch\s*\([^)]*\)/gi, "#111827");
  cleanedHtml = cleanedHtml.replace(/\boklab\s*\([^)]*\)/gi, "#111827");
  cleanedHtml = cleanedHtml.replace(/\blch\s*\([^)]*\)/gi, "#111827");
  cleanedHtml = cleanedHtml.replace(/\blab\s*\([^)]*\)/gi, "#111827");
  // استبدال أي كلمة متبقية (مثل "oklch" بدون أقواس)
  cleanedHtml = cleanedHtml.replace(/\boklch\b/gi, "#111827");
  cleanedHtml = cleanedHtml.replace(/\boklab\b/gi, "#111827");
  cleanedHtml = cleanedHtml.replace(/\blch\b/gi, "#111827");
  cleanedHtml = cleanedHtml.replace(/\blab\b/gi, "#111827");

  // تنظيف الأنماط المضمنة (style attribute)
  cleanedHtml = cleanedHtml.replace(/(style\s*=\s*["'])([^"']*)(["'])/gi, (match, p1, p2, p3) => {
    let cleaned = p2;
    cleaned = cleaned.replace(/\bcolor-mix\s*\([^)]*\)/gi, "#111827");
    cleaned = cleaned.replace(/\boklch\s*\([^)]*\)/gi, "#111827");
    cleaned = cleaned.replace(/\boklab\s*\([^)]*\)/gi, "#111827");
    cleaned = cleaned.replace(/\blch\s*\([^)]*\)/gi, "#111827");
    cleaned = cleaned.replace(/\blab\s*\([^)]*\)/gi, "#111827");
    cleaned = cleaned.replace(/\boklch\b/gi, "#111827");
    cleaned = cleaned.replace(/\boklab\b/gi, "#111827");
    cleaned = cleaned.replace(/\blch\b/gi, "#111827");
    cleaned = cleaned.replace(/\blab\b/gi, "#111827");
    return `${p1}${cleaned}${p3}`;
  });

  doc.write(cleanedHtml);
  doc.close();

  // ================================================================
  // 2. استنساخ التقرير وتجريد جميع الأنماط والكلاسات
  // ================================================================
  const originalReport = doc.body.querySelector<HTMLElement>('[data-pdf-report="true"], .page') ?? doc.body.firstElementChild;
  if (!originalReport) throw new Error("لم يتم العثور على عنصر التقرير");

  // استنساخ عميق للعنصر
  const clone = originalReport.cloneNode(true) as HTMLElement;

  // إنشاء حاوية الطباعة المخصصة
  const printContainer = doc.createElement("div");
  printContainer.id = "pdf-print-container";
  printContainer.style.cssText = `
    width: 210mm;
    min-height: 297mm;
    margin: 0;
    padding: 12mm;
    box-sizing: border-box;
    background: #ffffff;
    direction: rtl;
    display: block;
    position: relative;
    overflow: visible;
  `;
  printContainer.appendChild(clone);

  // ================================================================
  // 3. إزالة جميع السمات (class, style, data-*) من كل العناصر
  // ================================================================
  function stripAllAttributes(el: HTMLElement) {
    // إزالة جميع السمات التي قد تحتوي على أنماط
    const attrs = Array.from(el.attributes);
    for (const attr of attrs) {
      const name = attr.name.toLowerCase();
      if (name === "class" || name === "style" || name.startsWith("data-") || name.startsWith("aria-")) {
        el.removeAttribute(name);
      }
    }
    // معالجة الأطفال
    el.childNodes.forEach(child => {
      if (child.nodeType === 1) stripAllAttributes(child as HTMLElement);
    });
  }
  stripAllAttributes(clone);

  // ================================================================
  // 4. إضافة أنماط جديدة نظيفة لتنسيق التقرير
  // ================================================================
  const style = doc.createElement("style");
  style.textContent = `
    /* إعادة تعيين الأنماط الأساسية */
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Cairo", "Tajawal", sans-serif; background: #fff; color: #111827; }
    #pdf-print-container { width: 100%; padding: 12mm; background: #fff; }

    /* الهيدر */
    .report-header { border-bottom: 2px solid #0f766e; padding-bottom: 12px; margin-bottom: 20px; display: block; width: 100%; }
    .header-top { display: table; width: 100%; }
    .header-top > .col { display: table-cell; vertical-align: middle; }
    .header-left { width: 64px; }
    .header-right { text-align: left; width: 40%; padding-right: 12px; }
    .logo { display: inline-block; width: 56px; height: 56px; border-radius: 14px; background: linear-gradient(135deg, #0f766e, #0891b2); color: #fff; text-align: center; line-height: 56px; font-weight: 900; font-size: 24px; }
    .system-name { font-size: 16px; font-weight: 900; color: #0f172a; }
    .report-name { font-size: 18px; font-weight: 900; color: #0f766e; margin-top: 6px; }
    .header-meta { font-size: 11px; color: #64748b; line-height: 1.9; }
    .header-meta b { color: #334155; }
    .meta-line { display: block; }

    /* البطاقات */
    .card { border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 24px; background: #fff; overflow: hidden; }
    .card-title { background: #f1f5f9; color: #0f172a; font-weight: 800; font-size: 13px; padding: 10px 14px; border-bottom: 1px solid #e2e8f0; display: block; }
    .card-title .chip { float: left; background: #fff; color: #0f766e; border: 1px solid #e2e8f0; border-radius: 999px; padding: 1px 10px; font-size: 10.5px; font-weight: 800; }
    .card-body { padding: 12px 14px; }
    .card-body.pad-0 { padding: 0; }

    /* شبكة الملخص */
    .summary-grid { display: table; width: 100%; border-collapse: collapse; }
    .sum-row { display: table-row; }
    .sum-label, .sum-value { display: table-cell; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12px; vertical-align: middle; }
    .sum-label { width: 55%; color: #334155; font-weight: 600; background: #fafafa; }
    .sum-value { width: 45%; color: #0f172a; font-weight: 800; text-align: center; }
    .summary-grid .sum-row:last-child .sum-label, .summary-grid .sum-row:last-child .sum-value { border-bottom: 0; }

    /* الجداول */
    .report-table { width: 100%; border-collapse: collapse; table-layout: fixed; direction: rtl; font-size: 11.5px; }
    .report-table thead th { background: #f1f5f9; color: #0f172a; font-weight: 800; padding: 10px 8px; text-align: right; border: 1px solid #cbd5e1; height: 38px; }
    .report-table tbody td { padding: 9px 8px; text-align: right; border: 1px solid #e2e8f0; word-break: break-word; vertical-align: middle; color: #0f172a; }
    .report-table tbody tr:nth-child(even) td { background: #f8fafc; }
    .report-table td.num, .report-table th.num { text-align: center; }
    .report-table td.idx { color: #64748b; font-weight: 700; }
    .report-table .empty { text-align: center; color: #64748b; padding: 16px 0; font-style: italic; }

    /* التذييل */
    .report-footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #e2e8f0; display: table; width: 100%; font-size: 10.5px; color: #64748b; }
    .report-footer > div { display: table-cell; vertical-align: middle; }
    .report-footer .rf-left { text-align: left; }
    .report-footer .rf-center { text-align: center; }
    .report-footer .rf-right { text-align: right; }
    .report-footer .sig { color: #0f766e; font-weight: 900; }
  `;
  printContainer.appendChild(style);

  // استبدال محتوى body بالحاوية الجديدة
  doc.body.innerHTML = "";
  doc.body.appendChild(printContainer);

  // انتظار تحميل الخطوط والصور
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

  // ================================================================
  // 5. توليد PDF باستخدام الإعدادات المطلوبة
  // ================================================================
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

  let blob: Blob;
  try {
    const worker = html2pdf().set(opt).from(printContainer).toPdf();
    const pdf: any = await worker.get("pdf");

    // إضافة أرقام الصفحات وتوقيع
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
    // تنظيف الإطار
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
