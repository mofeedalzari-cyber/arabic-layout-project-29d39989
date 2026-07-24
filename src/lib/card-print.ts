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

/** يرسم كل كرت (قالب + الكود) على canvas ويحوّله إلى dataURL. */
async function renderCardImage(template: CardTemplate, code: string): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("template image load failed"));
    el.src = template.image;
  });
  const W = Math.max(400, Math.min(1600, img.naturalWidth || 800));
  const H = Math.round(W * ((img.naturalHeight || 500) / (img.naturalWidth || 800)));
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0, W, H);

  const bx = (template.codeX / 100) * W;
  const by = (template.codeY / 100) * H;
  const bw = (template.codeWidth / 100) * W;
  const bh = (template.codeHeight / 100) * H;
  const fontPx = Math.round(template.fontSize * (W / 800));
  ctx.fillStyle = template.fontColor;
  ctx.font = `${template.fontWeight} ${fontPx}px "Arial Black", Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.direction = "ltr";
  ctx.fillText(String(code), bx + bw / 2, by + bh / 2);
  return c.toDataURL("image/jpeg", 0.92);
}

/**
 * طباعة الكروت كملف PDF عبر pdfmake (نفس المكتبة المستخدمة في تقارير المبيعات).
 * 3 أعمدة على A4، صورة كل كرت مرسومة بالكود فوق القالب.
 */
export async function printCardsPdf(opts: {
  template: CardTemplate;
  codes: string[];
  title: string;
}): Promise<void> {
  const { template, codes, title } = opts;
  if (!codes.length) throw new Error("لا توجد كروت للطباعة");

  const images = await Promise.all(codes.map((c) => renderCardImage(template, c)));

  const COLS = 3;
  const rows: any[][] = [];
  for (let i = 0; i < images.length; i += COLS) {
    const row = images.slice(i, i + COLS).map((img) => ({
      image: img,
      width: 165, // ~ (A4 width 595pt - margins) / 3
      margin: [2, 2, 2, 2],
    }));
    while (row.length < COLS) row.push({ text: "" } as any);
    rows.push(row);
  }

  const pdfMakeMod: any = await import("pdfmake/build/pdfmake");
  const pdfMake: any = pdfMakeMod.default ?? pdfMakeMod;

  // reuse font vfs from pdfmake-report via a shared fetch
  const FONT_URLS: Record<string, string> = {
    "Cairo-Regular.ttf":
      "https://fonts.gstatic.com/s/cairo/v31/SLXgc1nY6HkvangtZmpQdkhzfH5lkSs2SgRjCAGMQ1z0hOA-W1Q.ttf",
    "Cairo-Bold.ttf":
      "https://fonts.gstatic.com/s/cairo/v31/SLXgc1nY6HkvangtZmpQdkhzfH5lkSs2SgRjCAGMQ1z0hAc5W1Q.ttf",
  };
  const toB64 = async (u: string) => {
    const r = await fetch(u);
    const buf = new Uint8Array(await r.arrayBuffer());
    let bin = ""; const CHUNK = 0x8000;
    for (let i = 0; i < buf.length; i += CHUNK) bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
    return btoa(bin);
  };
  const vfs = Object.fromEntries(
    await Promise.all(Object.entries(FONT_URLS).map(async ([n, u]) => [n, await toB64(u)] as const)),
  );
  if (typeof pdfMake.addVirtualFileSystem === "function") pdfMake.addVirtualFileSystem(vfs);
  else pdfMake.vfs = { ...(pdfMake.vfs || {}), ...vfs };
  const FONTS = { Cairo: { normal: "Cairo-Regular.ttf", bold: "Cairo-Bold.ttf", italics: "Cairo-Regular.ttf", bolditalics: "Cairo-Bold.ttf" } };
  if (typeof pdfMake.addFonts === "function") pdfMake.addFonts(FONTS);
  else pdfMake.fonts = { ...(pdfMake.fonts || {}), ...FONTS };

  const dateStr = new Date().toLocaleString("ar-EG-u-nu-latn", { dateStyle: "medium", timeStyle: "short" });

  const doc: any = {
    pageSize: "A4",
    pageMargins: [20, 24, 20, 24],
    defaultStyle: { font: "Cairo", fontSize: 10 },
    content: [
      {
        columns: [
          { text: title, alignment: "right", bold: true, fontSize: 12 },
          { text: `${codes.length} كرت — ${dateStr}`, alignment: "left", fontSize: 9, color: "#64748b" },
        ],
        margin: [0, 0, 0, 8],
      },
      {
        table: { widths: ["*", "*", "*"], body: rows },
        layout: "noBorders",
      },
    ],
  };

  const blob: Blob = await new Promise((resolve, reject) => {
    try {
      pdfMake.createPdf(doc).getBuffer((buf: any) => {
        const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf?.buffer ?? buf);
        resolve(new Blob([u8], { type: "application/pdf" }));
      });
    } catch (e) { reject(e); }
  });

  const { sharePdfBlob } = await import("./native-pdf");
  await sharePdfBlob({ blob, filename: title, dialogTitle: "طباعة أو مشاركة الكروت" });
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
