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
