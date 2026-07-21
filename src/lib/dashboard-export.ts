import * as XLSX from "xlsx";

export type SummaryRow = { label: string; value: string | number };
export type TableSection = { title: string; cols: string[]; rows: (string | number)[][] };

export function exportToExcel(fileName: string, summary: SummaryRow[], sections: TableSection[]) {
  try {
    const wb = XLSX.utils.book_new();

    const sumAoA: (string | number)[][] = [["البند", "القيمة"], ...summary.map((s) => [s.label, s.value])];
    const wsSum = XLSX.utils.aoa_to_sheet(sumAoA);
    wsSum["!cols"] = [{ wch: 28 }, { wch: 20 }];
    (wsSum as unknown as { "!rtl": boolean })["!rtl"] = true;
    XLSX.utils.book_append_sheet(wb, wsSum, "الملخص");

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

    const isNumeric = (v: string | number) => {
      if (typeof v === "number") return true;
      const s = String(v).trim().replace(/[,\s٬٫]/g, "");
      return s !== "" && /^-?\d+(\.\d+)?$/.test(s);
    };

    const summaryCards = summary
      .map(
        (s, i) => `
      <div class="kpi kpi-${(i % 4) + 1}">
        <div class="kpi-l">${esc(s.label)}</div>
        <div class="kpi-v">${esc(s.value)}</div>
      </div>`,
      )
      .join("");

    const sectionsHtml = sections
      .map(
        (sec) => `
      <h2><span class="dot"></span>${esc(sec.title)}<span class="count">${sec.rows.length}</span></h2>
      <div class="tbl-wrap">
        <table>
          <thead><tr>
            <th class="num">#</th>
            ${sec.cols.map((c) => `<th>${esc(c)}</th>`).join("")}
          </tr></thead>
          <tbody>${
            sec.rows.length === 0
              ? `<tr><td colspan="${sec.cols.length + 1}" class="empty">— لا توجد بيانات —</td></tr>`
              : sec.rows
                  .map(
                    (r, i) => `<tr>
                      <td class="num"><span class="idx">${i + 1}</span></td>
                      ${r
                        .map(
                          (c) =>
                            `<td class="${isNumeric(c) ? "num money" : ""}">${esc(c)}</td>`,
                        )
                        .join("")}
                    </tr>`,
                  )
                  .join("")
          }</tbody>
        </table>
      </div>`,
      )
      .join("");

    const date = new Date().toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" });
    const html = `<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<style>
  :root {
    --brand:#0ea884; --brand-2:#0891b2; --brand-3:#065f46;
    --ink:#0f172a; --muted:#64748b; --line:#e2e8f0; --soft:#f8fafc;
    --gold:#d4a017;
  }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; }
  body {
    font-family: "Cairo", "Segoe UI", Tahoma, Arial, sans-serif;
    color: var(--ink);
    background:
      radial-gradient(1200px 400px at 100% -10%, rgba(14,168,132,.08), transparent 60%),
      radial-gradient(900px 300px at 0% 110%, rgba(8,145,178,.08), transparent 60%),
      #fff;
    padding: 24px;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .page { max-width: 1000px; margin: 0 auto; }

  /* Header */
  .head {
    position: relative; color:#fff;
    background: linear-gradient(135deg, var(--brand) 0%, var(--brand-2) 100%);
    border-radius: 18px; padding: 22px 26px;
    box-shadow: 0 10px 30px -12px rgba(14,168,132,.55);
    overflow: hidden;
  }
  .head::after { content:""; position:absolute; inset:auto -60px -80px auto; width:260px; height:260px; border-radius:50%; background:rgba(255,255,255,.08); }
  .head::before { content:""; position:absolute; inset:-80px auto auto -60px; width:200px; height:200px; border-radius:50%; background:rgba(255,255,255,.08); }
  .head-row { display:flex; justify-content:space-between; align-items:center; gap:16px; position:relative; z-index:1; }
  .brand-wrap { display:flex; align-items:center; gap:12px; }
  .logo { width:52px; height:52px; border-radius:14px; background: rgba(255,255,255,.18); border:1.5px solid rgba(255,255,255,.35); display:flex; align-items:center; justify-content:center; font-weight:900; font-size:22px; }
  .brand-name { font-weight:900; font-size:20px; letter-spacing:.3px; }
  .brand-sub { font-size:12px; opacity:.88; margin-top:2px; }
  .doc-meta { text-align:left; font-size:12px; opacity:.92; }
  .doc-badge { display:inline-block; background: rgba(255,255,255,.18); border:1px solid rgba(255,255,255,.3); border-radius:999px; padding:4px 10px; font-weight:700; font-size:11px; margin-bottom:6px; }
  .doc-title { font-size:22px; font-weight:900; margin-top:14px; position:relative; z-index:1; }

  /* KPI cards */
  .kpis { display:grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap:12px; margin: 18px 0 22px; }
  .kpi { position:relative; border-radius:14px; padding:14px 14px 12px; background:#fff; border:1px solid var(--line); overflow:hidden; box-shadow: 0 2px 8px -6px rgba(15,23,42,.15); }
  .kpi::before { content:""; position:absolute; inset:0 auto 0 0; width:4px; background: linear-gradient(180deg, var(--brand), var(--brand-2)); }
  .kpi-1::before { background: linear-gradient(180deg, #0ea884, #0891b2); }
  .kpi-2::before { background: linear-gradient(180deg, #0891b2, #6366f1); }
  .kpi-3::before { background: linear-gradient(180deg, #d4a017, #f59e0b); }
  .kpi-4::before { background: linear-gradient(180deg, #e11d48, #f43f5e); }
  .kpi-l { font-size:11px; color: var(--muted); font-weight:700; letter-spacing:.2px; }
  .kpi-v { font-size:19px; font-weight:900; margin-top:6px; color: var(--ink); font-variant-numeric: tabular-nums; }

  /* Section titles */
  h2 {
    font-size:14px; margin: 24px 0 10px; padding: 0 0 8px;
    color: var(--ink); font-weight:800;
    display:flex; align-items:center; gap:8px;
    border-bottom: 2px solid var(--line);
    position:relative;
  }
  h2 .dot { width:14px; height:14px; border-radius:4px; background: linear-gradient(135deg, var(--brand), var(--brand-2)); }
  h2 .count { margin-inline-start:auto; font-size:11px; font-weight:800; color: var(--brand-3); background:#ecfdf5; border:1px solid #a7f3d0; padding:3px 10px; border-radius:999px; }
  h2::after { content:""; position:absolute; right:0; bottom:-2px; width:80px; height:2px; background: linear-gradient(90deg, var(--brand), var(--brand-2)); }

  /* Tables */
  .tbl-wrap { background:#fff; border:1px solid var(--line); border-radius:14px; overflow:hidden; box-shadow: 0 2px 8px -6px rgba(15,23,42,.15); }
  table { width:100%; border-collapse: collapse; font-size:12.5px; }
  thead th {
    background: linear-gradient(135deg, #f1f5f9, #e2e8f0);
    color: var(--ink); font-weight:800;
    padding:10px; text-align:right;
    border-bottom: 2px solid var(--line);
    font-size:12px;
  }
  tbody td { padding:9px 10px; text-align:right; border-top:1px solid var(--line); }
  tbody tr:nth-child(even) td { background: var(--soft); }
  td.num, th.num { text-align:center; font-variant-numeric: tabular-nums; }
  td.money { font-weight:800; color: var(--brand-3); }
  .idx { display:inline-flex; align-items:center; justify-content:center; min-width:24px; height:24px; padding:0 6px; border-radius:8px; background:#eef2ff; color:#3730a3; font-weight:800; font-size:11px; }
  .empty { text-align:center; color: var(--muted); padding:18px 0; font-style:italic; }

  /* Footer */
  .footer { margin-top:28px; padding-top:14px; border-top: 2px dashed var(--line); display:flex; justify-content:space-between; align-items:center; font-size:11.5px; color: var(--muted); }
  .footer .sig { background: linear-gradient(135deg, var(--brand), var(--brand-2)); -webkit-background-clip: text; background-clip:text; color:transparent; font-weight:900; }

  @media print {
    body { padding: 8mm; background:#fff !important; }
    .head, .kpi, .tbl-wrap { box-shadow:none; }
    h2 { page-break-after: avoid; }
    tr { page-break-inside: avoid; }
  }
</style>
</head>
<body>
  <div class="page">
    <div class="head">
      <div class="head-row">
        <div class="brand-wrap">
          <div class="logo">📊</div>
          <div>
            <div class="brand-name">كروت الواي فاي — TOP UP</div>
            <div class="brand-sub">نظام إدارة الشبكات والمناديب</div>
          </div>
        </div>
        <div class="doc-meta">
          <div class="doc-badge">تقرير</div>
          <div>📅 ${esc(date)}</div>
        </div>
      </div>
      <div class="doc-title">${esc(title)}</div>
    </div>

    ${summary.length ? `<div class="kpis">${summaryCards}</div>` : ""}

    ${sectionsHtml}

    <div class="footer">
      <div>© جميع الحقوق محفوظة</div>
      <div>برمجة وتصميم <span class="sig">مفيد الزري</span> · 778492884</div>
    </div>
  </div>
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 300));</script>
</body>
</html>`;

    try {
      const { sharePdfOrPrint } = await import("./native-pdf");
      await sharePdfOrPrint({ html, filename: title, dialogTitle: "مشاركة أو طباعة التقرير" });
    } catch (shareErr) {
      console.error("[exportToPDF] sharePdfOrPrint failed:", shareErr);
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
