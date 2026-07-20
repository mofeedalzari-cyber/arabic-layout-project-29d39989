import * as XLSX from "xlsx";

export type SummaryRow = { label: string; value: string | number };
export type TableSection = { title: string; cols: string[]; rows: (string | number)[][] };

export function exportToExcel(fileName: string, summary: SummaryRow[], sections: TableSection[]) {
  try {
    const wb = XLSX.utils.book_new();

    // Summary sheet
    const sumAoA: (string | number)[][] = [["البند", "القيمة"], ...summary.map((s) => [s.label, s.value])];
    const wsSum = XLSX.utils.aoa_to_sheet(sumAoA);
    wsSum["!cols"] = [{ wch: 28 }, { wch: 20 }];
    (wsSum as unknown as { "!rtl": boolean })["!rtl"] = true;
    XLSX.utils.book_append_sheet(wb, wsSum, "الملخص");

    // Each section as its own sheet
    sections.forEach((sec) => {
      const aoa: (string | number)[][] = [sec.cols, ...sec.rows];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = sec.cols.map(() => ({ wch: 20 }));
      (ws as unknown as { "!rtl": boolean })["!rtl"] = true;
      const sheetName = sec.title.slice(0, 30);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    XLSX.writeFile(wb, `${fileName}.xlsx`);
  } catch (err) {
    console.error("[exportToExcel] failed:", err);
    alert("فشل تصدير ملف Excel، يرجى المحاولة مجدداً");
  }
}

export async function exportToPDF(title: string, summary: SummaryRow[], sections: TableSection[]) {
  try {
    const esc = (v: string | number) =>
      String(v)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    const summaryHtml = `
      <table>
        <thead><tr><th>البند</th><th>القيمة</th></tr></thead>
        <tbody>${summary.map((s) => `<tr><td>${esc(s.label)}</td><td>${esc(s.value)}</td></tr>`).join("")}</tbody>
      </table>`;

    const sectionsHtml = sections
      .map(
        (sec) => `
        <h2>${esc(sec.title)}</h2>
        <table>
          <thead><tr>${sec.cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
          <tbody>${
            sec.rows.length === 0
              ? `<tr><td colspan="${sec.cols.length}" style="text-align:center;color:#888">لا توجد بيانات</td></tr>`
              : sec.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")
          }</tbody>
        </table>`,
      )
      .join("");

    const date = new Date().toLocaleString("ar-SA");
    const html = `<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", "Tahoma", "Arial", sans-serif; color: #111; margin: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 22px 0 8px; border-bottom: 2px solid #333; padding-bottom: 4px; }
  .meta { color: #666; font-size: 12px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #bbb; padding: 6px 8px; text-align: right; }
  th { background: #f0f0f0; font-weight: 700; }
  tbody tr:nth-child(even) td { background: #fafafa; }
  @media print { body { margin: 12mm; } h2 { page-break-after: avoid; } tr { page-break-inside: avoid; } }
</style>
</head>
<body>
  <h1>${esc(title)}</h1>
  <div class="meta">تاريخ التصدير: ${esc(date)}</div>
  <h2>الملخص</h2>
  ${summaryHtml}
  ${sectionsHtml}
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 300));</script>
</body>
</html>`;

    try {
      const { sharePdfOrPrint } = await import("./native-pdf");
      await sharePdfOrPrint({ html, filename: title, dialogTitle: "مشاركة أو طباعة التقرير" });
    } catch (shareErr) {
      console.error("[exportToPDF] sharePdfOrPrint failed:", shareErr);
      
      // Fallback: Try to open in new window for printing
      try {
        const w = window.open("", "_blank");
        if (w) {
          w.document.open();
          w.document.write(html);
          w.document.close();
        } else {
          alert("يرجى السماح بالنوافذ المنبثقة للطباعة");
        }
      } catch (fallbackErr) {
        console.error("[exportToPDF] fallback print failed:", fallbackErr);
        alert("فشل طباعة التقرير، يرجى المحاولة مجدداً");
      }
    }
  } catch (err) {
    console.error("[exportToPDF] CRITICAL error:", err);
    alert("حدث خطأ غير متوقع أثناء طباعة التقرير");
  }
}