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


export type ReportMeta = {
  reportName?: string;
  branch?: string;
  user?: string;
  systemName?: string;
};

export async function exportToPDF(
  title: string,
  summary: SummaryRow[],
  sections: TableSection[],
  meta: ReportMeta = {},
) {
  try {
    const esc = (v: string | number) =>
      String(v ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    const isNumeric = (v: string | number) => {
      if (typeof v === "number") return true;
      const s = String(v).trim().replace(/[,\s٬٫]/g, "");
      return s !== "" && /^-?\d+(\.\d+)?$/.test(s);
    };

    // Auto-fill user from Supabase session if not provided
    let userName = meta.user ?? "";
    if (!userName) {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data } = await supabase.auth.getUser();
        const u = data?.user;
        userName =
          (u?.user_metadata as any)?.full_name ||
          (u?.user_metadata as any)?.username ||
          u?.phone ||
          u?.email ||
          "—";
      } catch {
        userName = "—";
      }
    }

    const systemName = meta.systemName || "كرتي — نظام إدارة الشبكات والمناديب";
    const reportName = meta.reportName || title;
    const branch = meta.branch || "—";
    const dateStr = new Date().toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" });

    // Summary card: two-column grid of label/value rows
    const summaryHtml = summary.length
      ? `
    <section class="card">
      <div class="card-title">ملخص التقرير</div>
      <div class="card-body">
        <div class="summary-grid">
          ${summary
            .map(
              (s) => `
            <div class="sum-row">
              <div class="sum-label">${esc(s.label)}</div>
              <div class="sum-value">${esc(s.value)}</div>
            </div>`,
            )
            .join("")}
        </div>
      </div>
    </section>`
      : "";

    const sectionsHtml = sections
      .map(
        (sec) => `
      <section class="card">
        <div class="card-title">${esc(sec.title)}<span class="chip">${sec.rows.length}</span></div>
        <div class="card-body pad-0">
          <table class="report-table">
            <colgroup>
              <col style="width:36px" />
              ${sec.cols.map(() => `<col />`).join("")}
            </colgroup>
            <thead>
              <tr>
                <th class="num">#</th>
                ${sec.cols.map((c) => `<th>${esc(c)}</th>`).join("")}
              </tr>
            </thead>
            <tbody>
              ${
                sec.rows.length === 0
                  ? `<tr><td colspan="${sec.cols.length + 1}" class="empty">— لا توجد بيانات —</td></tr>`
                  : sec.rows
                      .map(
                        (r, i) => `<tr>
                          <td class="num idx">${i + 1}</td>
                          ${r
                            .map(
                              (c) =>
                                `<td class="${isNumeric(c) ? "num" : "txt"}">${esc(c)}</td>`,
                            )
                            .join("")}
                        </tr>`,
                      )
                      .join("")
              }
            </tbody>
          </table>
        </div>
      </section>`,
      )
      .join("");

    const html = `<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Tajawal:wght@400;500;700;800;900&display=swap" rel="stylesheet">
<style>
  :root {
    --ink:#0f172a;
    --ink-soft:#334155;
    --muted:#64748b;
    --line:#e2e8f0;
    --line-strong:#cbd5e1;
    --header-bg:#f1f5f9;
    --alt-row:#f8fafc;
    --brand:#0f766e;
    --brand-2:#0891b2;
  }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; background:#fff; color: var(--ink); }
  body {
    font-family: "Cairo", "Tajawal", "Segoe UI", Tahoma, Arial, sans-serif;
    font-size: 12px;
    line-height: 1.6;
    direction: rtl;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }

  /* ============ HEADER ============ */
  .report-header {
    display: block;
    width: 100%;
    border-bottom: 2px solid var(--brand);
    padding: 0 0 12px;
    margin: 0 0 20px;
  }
  .header-top {
    display: table; width: 100%; table-layout: fixed;
  }
  .header-top > .col {
    display: table-cell; vertical-align: middle;
  }
  .header-left { width: 64px; }
  .header-right { text-align: left; width: 40%; padding-inline-start: 12px; }
  .logo {
    width:56px; height:56px; border-radius:14px;
    background: linear-gradient(135deg, var(--brand), var(--brand-2));
    color:#fff; display:inline-block; text-align:center;
    line-height:56px; font-weight:900; font-size:24px;
  }
  .system-name { font-size: 16px; font-weight: 900; color: var(--ink); margin-bottom: 2px; }
  .report-name { font-size: 18px; font-weight: 900; color: var(--brand); margin-top: 6px; }
  .header-meta { font-size: 11px; color: var(--muted); line-height: 1.9; }
  .header-meta b { color: var(--ink-soft); font-weight: 700; }
  .meta-line { display: block; }

  /* ============ CARDS ============ */
  .card {
    border: 1px solid var(--line);
    border-radius: 8px;
    margin: 0 0 24px;
    background: #fff;
    overflow: hidden;
    page-break-inside: auto;
    break-inside: auto;
  }
  .card-title {
    background: var(--header-bg);
    color: var(--ink);
    font-weight: 800;
    font-size: 13px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--line);
    display: block;
  }
  .card-title .chip {
    float: left;
    background: #fff;
    color: var(--brand);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 1px 10px;
    font-size: 10.5px;
    font-weight: 800;
  }
  .card-body { padding: 12px 14px; }
  .card-body.pad-0 { padding: 0; }

  /* ============ SUMMARY GRID (2 columns) ============ */
  .summary-grid {
    display: table;
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .sum-row {
    display: table-row;
  }
  .sum-label, .sum-value {
    display: table-cell;
    padding: 8px 12px;
    border-bottom: 1px solid var(--line);
    font-size: 12px;
    vertical-align: middle;
  }
  .sum-label {
    width: 55%;
    color: var(--ink-soft);
    font-weight: 600;
    background: #fafafa;
  }
  .sum-value {
    width: 45%;
    color: var(--ink);
    font-weight: 800;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .summary-grid .sum-row:last-child .sum-label,
  .summary-grid .sum-row:last-child .sum-value { border-bottom: 0; }

  /* ============ TABLES ============ */
  .report-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    direction: rtl;
    font-size: 11.5px;
  }
  .report-table thead th {
    background: var(--header-bg);
    color: var(--ink);
    font-weight: 800;
    padding: 10px 8px;
    text-align: right;
    border: 1px solid var(--line-strong);
    font-size: 12px;
    height: 38px;
  }
  .report-table tbody td {
    padding: 9px 8px;
    text-align: right;
    border: 1px solid var(--line);
    word-break: break-word;
    overflow-wrap: anywhere;
    white-space: normal;
    vertical-align: middle;
    font-size: 11.5px;
    color: var(--ink);
  }
  .report-table tbody tr:nth-child(even) td { background: var(--alt-row); }
  .report-table tbody tr { page-break-inside: avoid; break-inside: avoid; }
  .report-table td.num, .report-table th.num {
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .report-table td.idx {
    color: var(--muted);
    font-weight: 700;
  }
  .report-table .empty {
    text-align: center;
    color: var(--muted);
    padding: 16px 0;
    font-style: italic;
  }

  /* ============ FOOTER ============ */
  .report-footer {
    margin-top: 24px;
    padding-top: 10px;
    border-top: 1px solid var(--line);
    display: table;
    width: 100%;
    font-size: 10.5px;
    color: var(--muted);
  }
  .report-footer > div {
    display: table-cell;
    vertical-align: middle;
  }
  .report-footer .rf-left { text-align: left; }
  .report-footer .rf-center { text-align: center; }
  .report-footer .rf-right { text-align: right; }
  .report-footer .sig { color: var(--brand); font-weight: 900; }
</style>
</head>
<body>
  <div data-pdf-report="true" class="page">

    <header class="report-header">
      <div class="header-top">
        <div class="col header-left">
          <div class="logo">ك</div>
        </div>
        <div class="col">
          <div class="system-name">${esc(systemName)}</div>
          <div class="report-name">${esc(reportName)}</div>
        </div>
        <div class="col header-right">
          <div class="header-meta">
            <span class="meta-line"><b>التاريخ:</b> ${esc(dateStr)}</span>
            <span class="meta-line"><b>الفرع / الشبكة:</b> ${esc(branch)}</span>
            <span class="meta-line"><b>المستخدم:</b> ${esc(userName)}</span>
          </div>
        </div>
      </div>
    </header>

    ${summaryHtml}
    ${sectionsHtml}

    <footer class="report-footer">
      <div class="rf-right">© جميع الحقوق محفوظة — <span class="sig">كرتي</span></div>
      <div class="rf-center">تاريخ الطباعة: ${esc(dateStr)}</div>
      <div class="rf-left">برمجة وتصميم <span class="sig">مفيد الزري</span></div>
    </footer>

  </div>
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
