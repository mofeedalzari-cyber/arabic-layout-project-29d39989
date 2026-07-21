import ExcelJS from "exceljs";

export type SummaryRow = { label: string; value: string | number };
export type TableSection = { title: string; cols: string[]; rows: (string | number)[][] };

export async function exportToExcel(
  fileName: string,
  summary: SummaryRow[],
  sections: TableSection[],
) {
  try {
    const wb = new ExcelJS.Workbook();

    const wsSum = wb.addWorksheet("الملخص", { views: [{ rightToLeft: true }] });
    wsSum.columns = [
      { header: "البند", key: "label", width: 28 },
      { header: "القيمة", key: "value", width: 20 },
    ];
    summary.forEach((s) => wsSum.addRow({ label: s.label, value: s.value }));

    sections.forEach((sec, i) => {
      const name = (sec.title || `ورقة ${i + 1}`).slice(0, 30).replace(/[\\/*?:[\]]/g, " ");
      const ws = wb.addWorksheet(name, { views: [{ rightToLeft: true }] });
      ws.columns = sec.cols.map((c) => ({ header: c, key: c, width: 20 }));
      sec.rows.forEach((row) => ws.addRow(row));
    });

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Tajawal:wght@400;500;700;800;900&display=swap" rel="stylesheet">
<style>
  @page { size: A4 portrait; margin: 12mm 12mm 15mm 12mm; }
  :root {
    --brand:#0ea884; --brand-2:#0891b2; --brand-3:#065f46;
    --ink:#0f172a; --muted:#64748b; --line:#d1d5db; --soft:#fafafa;
    --header-bg:#f3f4f6;
  }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; background:#fff; }
  body {
    font-family: "Cairo", "Tajawal", "Segoe UI", Tahoma, Arial, sans-serif;
    color: var(--ink);
    font-size: 13px;
    line-height: 1.55;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
    direction: rtl;
  }
  .page { width: 100%; margin: 0 auto; }

  /* Header */
  .head {
    display:flex; justify-content:space-between; align-items:center;
    gap:16px; padding: 6px 0 12px;
    border-bottom: 2px solid var(--brand);
    margin-bottom: 18px;
  }
  .brand-wrap { display:flex; align-items:center; gap:12px; }
  .logo {
    width:48px; height:48px; border-radius:12px;
    background: linear-gradient(135deg, var(--brand), var(--brand-2));
    color:#fff; display:flex; align-items:center; justify-content:center;
    font-weight:900; font-size:22px;
  }
  .brand-name { font-weight:900; font-size:18px; color: var(--ink); }
  .brand-sub { font-size:11.5px; color: var(--muted); margin-top:2px; }
  .doc-meta { text-align:left; font-size:11.5px; color: var(--muted); }
  .doc-badge {
    display:inline-block; background: var(--header-bg);
    border:1px solid var(--line); color: var(--ink);
    border-radius: 6px; padding:3px 10px; font-weight:700; font-size:11px;
    margin-bottom:4px;
  }
  .doc-title { font-size:18px; font-weight:900; margin: 4px 0 0; color: var(--ink); }

  /* KPI cards */
  .kpis { display:grid; grid-template-columns: repeat(4, 1fr); gap:8px; margin: 0 0 24px; }
  .kpi {
    border:1px solid var(--line); border-radius:8px;
    padding:10px 12px; background:#fff;
    break-inside: avoid; page-break-inside: avoid;
  }
  .kpi-l { font-size:11px; color: var(--muted); font-weight:600; }
  .kpi-v { font-size:16px; font-weight:900; margin-top:4px; color: var(--ink); font-variant-numeric: tabular-nums; }

  /* Section titles */
  h2 {
    font-size:14px; margin: 24px 0 8px; padding: 6px 10px;
    color:#fff; font-weight:800;
    background: linear-gradient(135deg, var(--brand), var(--brand-2));
    border-radius: 6px;
    display:flex; align-items:center; gap:8px;
    page-break-after: avoid;
  }
  h2 .dot { display:none; }
  h2 .count { margin-inline-start:auto; font-size:11px; font-weight:800; color: var(--brand-3); background:#fff; padding:2px 8px; border-radius:999px; }

  /* Tables */
  .tbl-wrap {
    border:1px solid var(--line); border-radius: 6px;
    overflow:hidden; margin-bottom: 24px;
    break-inside: avoid;
  }
  table { width:100%; border-collapse: collapse; font-size:12.5px; table-layout: fixed; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  thead th {
    background: var(--header-bg);
    color: var(--ink); font-weight:700;
    padding:10px 8px; text-align:right;
    border:1px solid var(--line);
    font-size:13px;
    height: 40px;
  }
  tbody td {
    padding:10px 8px; text-align:right;
    border:1px solid var(--line);
    height: 40px;
    word-break: break-word; overflow-wrap: anywhere;
  }
  tbody tr:nth-child(even) td { background: var(--soft); }
  tbody tr:nth-child(odd) td { background: #ffffff; }
  td.num, th.num { text-align:center; font-variant-numeric: tabular-nums; }
  td.money { font-weight:700; color: var(--brand-3); }
  .idx { display:inline-block; min-width:22px; padding:1px 6px; border-radius:4px; background:var(--header-bg); color:var(--ink); font-weight:700; font-size:11px; }
  .empty { text-align:center; color: var(--muted); padding:14px 0; font-style:italic; }

  /* Footer */
  .footer {
    margin-top:24px; padding-top:10px;
    border-top: 1px solid var(--line);
    display:flex; justify-content:space-between; align-items:center;
    font-size:11px; color: var(--muted);
  }
  .footer .sig { color: var(--brand); font-weight:900; }

  @media print {
    body { background:#fff !important; }
    .noprint { display:none !important; }
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
            <div class="brand-name">كرتي</div>
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
