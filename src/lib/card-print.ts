export interface CardTemplate {
  image: string; // data URL
  // نسبة موقع رمز الدخول من صورة القالب (%)
  codeX: number; // من اليسار
  codeY: number; // من الأعلى
  codeWidth: number; // عرض المربع
  codeHeight: number; // ارتفاع المربع
  fontSize: number; // بالبكسل نسبةً لعرض 800px
  fontColor: string;
  fontWeight: number;
}

export const DEFAULT_TEMPLATE: Omit<CardTemplate, "image"> = {
  codeX: 30,
  codeY: 38,
  codeWidth: 50,
  codeHeight: 18,
  fontSize: 44,
  fontColor: "#c1272d",
  fontWeight: 800,
};

const KEY = (pkgId: string) => `card-template:${pkgId}`;

export function loadTemplate(pkgId: string): CardTemplate | null {
  try {
    const raw = localStorage.getItem(KEY(pkgId));
    if (!raw) return null;
    return JSON.parse(raw) as CardTemplate;
  } catch {
    return null;
  }
}

export function saveTemplate(pkgId: string, tpl: CardTemplate) {
  localStorage.setItem(KEY(pkgId), JSON.stringify(tpl));
}

export function clearTemplate(pkgId: string) {
  localStorage.removeItem(KEY(pkgId));
}

export function printCards(opts: {
  template: CardTemplate;
  codes: string[];
  title: string;
  autoPrint?: boolean;
}) {
  const { template, codes, title, autoPrint = true } = opts;
  const esc = (s: string) =>
    String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const items = codes
    .map(
      (c) => `
      <div class="card">
        <img src="${template.image}" alt="" />
        <div class="code">${esc(c)}</div>
      </div>`,
    )
    .join("");

  const html = `<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 6mm; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 6mm; font-family: "Cairo", -apple-system, "Tahoma", Arial, sans-serif; background: #f3f4f6; }
  .toolbar {
    position: sticky; top: 0; z-index: 10;
    display: flex; gap: 8px; justify-content: center; align-items: center;
    padding: 10px; margin: -6mm -6mm 8mm; background: #ffffffee; border-bottom: 1px solid #e5e7eb;
  }
  .toolbar button {
    font: 600 14px system-ui, sans-serif; padding: 8px 18px; border-radius: 10px;
    border: 0; cursor: pointer;
  }
  .btn-print { background: #16a34a; color: #fff; }
  .btn-close { background: #e5e7eb; color: #111; }
  .info { color: #6b7280; font-size: 12px; margin-right: auto; }
  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 3mm;
    background: #fff;
    padding: 4mm;
    border-radius: 6px;
  }
  .card { position: relative; width: 100%; break-inside: avoid; page-break-inside: avoid; }
  .card img { width: 100%; height: auto; display: block; }
  .code {
    position: absolute;
    left: ${template.codeX}%;
    top: ${template.codeY}%;
    width: ${template.codeWidth}%;
    height: ${template.codeHeight}%;
    display: flex; align-items: center; justify-content: center;
    color: ${template.fontColor};
    font-weight: ${template.fontWeight};
    font-family: "Arial Black", Arial, sans-serif;
    font-size: ${Math.round(template.fontSize * 0.5)}px;
    letter-spacing: 1px;
    direction: ltr;
    white-space: nowrap;
  }
  @media print {
    body { margin: 0; padding: 0; background: #fff; }
    .toolbar { display: none !important; }
    .grid { gap: 2mm; padding: 0; border-radius: 0; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button class="btn-print" onclick="window.print()">🖨️ طباعة</button>
    <button class="btn-close" onclick="window.close()">إغلاق</button>
    <span class="info">${codes.length} كرت — A4 / 3 أعمدة</span>
  </div>
  <div class="grid">${items}</div>
  ${autoPrint ? `<script>
    window.addEventListener('load', () => {
      const imgs = Array.from(document.images);
      Promise.all(imgs.map(i => i.complete ? null : new Promise(r => { i.onload = i.onerror = r; })))
        .then(() => setTimeout(() => window.print(), 300));
    });
  </script>` : ""}
</body>
</html>`;

  // Open a native print window (web) or system share/preview (native).
  // Avoids html2pdf.js entirely, which was freezing the app on card grids.
  void import("./native-pdf").then(({ openHtmlForPrint }) =>
    openHtmlForPrint({ html, filename: title, dialogTitle: "طباعة أو مشاركة الكروت" }),
  );
}

export interface AssignedCardRow {
  code: string;
  username: string;
  package_name: string;
  agent_name: string;
  assigned_at?: string | null;
}

/** طباعة قالب الكروت المسحوبة (كشف تسليم للمندوب) */
export function printAssignedCards(opts: {
  rows: AssignedCardRow[];
  title?: string;
  networkName?: string;
  autoPrint?: boolean;
}) {
  const { rows, title = "كشف الكروت المسحوبة", networkName = "", autoPrint = true } = opts;
  const esc = (s: string) =>
    String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const fmtDate = (d?: string | null) => {
    if (!d) return "—";
    try {
      return new Intl.DateTimeFormat("ar-EG", {
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit",
      }).format(new Date(d));
    } catch { return "—"; }
  };
  const printedAt = fmtDate(new Date().toISOString());
  const total = rows.length;

  // Group by agent for summary
  const byAgent = new Map<string, number>();
  rows.forEach((r) => byAgent.set(r.agent_name || "—", (byAgent.get(r.agent_name || "—") ?? 0) + 1));

  const body = rows
    .map(
      (r, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td class="mono">${esc(r.code)}</td>
        <td>${esc(r.username)}</td>
        <td>${esc(r.package_name)}</td>
        <td>${esc(r.agent_name)}</td>
        <td class="c">${fmtDate(r.assigned_at)}</td>
      </tr>`,
    )
    .join("");

  const summary = Array.from(byAgent.entries())
    .map(([n, c]) => `<span class="chip"><b>${esc(n)}</b>: ${c}</span>`)
    .join("");

  const html = `<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 8mm; font-family: "Cairo", Tahoma, Arial, sans-serif; color: #111; background: #fff; }
  .toolbar {
    position: sticky; top: 0; z-index: 10;
    display: flex; gap: 8px; justify-content: center; align-items: center;
    padding: 10px; margin: -8mm -8mm 6mm; background: #ffffffee; border-bottom: 1px solid #e5e7eb;
  }
  .toolbar button { font: 700 14px "Cairo", system-ui; padding: 8px 18px; border-radius: 10px; border: 0; cursor: pointer; }
  .btn-print { background: #2563eb; color: #fff; }
  .btn-close { background: #e5e7eb; color: #111; }
  .head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px double #1e3a8a; padding-bottom: 6px; margin-bottom: 10px; }
  .head h1 { margin: 0; font-size: 20px; color: #1e3a8a; }
  .head .meta { font-size: 12px; color: #374151; text-align: left; line-height: 1.6; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 10px; }
  .chip { font-size: 11px; background: #eff6ff; border: 1px solid #bfdbfe; color: #1e3a8a; padding: 3px 8px; border-radius: 999px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #1f2937; padding: 6px 8px; text-align: right; }
  thead th { background: #1e3a8a; color: #fff; font-weight: 700; }
  tbody tr:nth-child(even) td { background: #f8fafc; }
  td.c { text-align: center; }
  td.mono { font-family: "Cairo", ui-monospace, Menlo, monospace; letter-spacing: 0.5px; direction: ltr; text-align: center; }
  .foot { display: flex; justify-content: space-between; margin-top: 14px; font-size: 12px; }
  .sig { border-top: 1px solid #111; padding-top: 4px; width: 40%; text-align: center; }
  @media print { .toolbar { display: none !important; } body { padding: 0; } }
</style>
</head>
<body>
  <div class="toolbar">
    <button class="btn-print" onclick="window.print()">🖨️ طباعة</button>
    <button class="btn-close" onclick="window.close()">إغلاق</button>
  </div>
  <div class="head">
    <div>
      <h1>${esc(title)}</h1>
      ${networkName ? `<div style="font-size:13px;color:#374151;">الشبكة: <b>${esc(networkName)}</b></div>` : ""}
    </div>
    <div class="meta">
      <div>تاريخ الطباعة: <b>${printedAt}</b></div>
      <div>إجمالي الكروت: <b>${total}</b></div>
    </div>
  </div>
  <div class="chips">${summary}</div>
  <table>
    <thead>
      <tr>
        <th class="c" style="width:36px">#</th>
        <th>الكود</th>
        <th>اسم المستخدم</th>
        <th>الفئة</th>
        <th>المندوب</th>
        <th class="c">تاريخ السحب</th>
      </tr>
    </thead>
    <tbody>${body || `<tr><td colspan="6" class="c" style="padding:16px;color:#6b7280">لا توجد بيانات</td></tr>`}</tbody>
  </table>
  <div class="foot">
    <div class="sig">توقيع المندوب</div>
    <div class="sig">توقيع المدير</div>
  </div>
  ${autoPrint ? `<script>window.addEventListener('load', () => setTimeout(() => window.print(), 300));</script>` : ""}
</body>
</html>`;

  void import("./native-pdf").then(({ openHtmlForPrint }) =>
    openHtmlForPrint({ html, filename: title, dialogTitle: "طباعة أو مشاركة كشف الكروت المسحوبة" }),
  );
}
