import { sanitizePdfText } from "./pdfmake-report";

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

export async function printCards(opts: {
  template: CardTemplate;
  codes: string[];
  title: string;
  autoPrint?: boolean;
}) {
  // معاينة/طباعة موحّدة كملف PDF عبر pdfmake (بدلاً من HTML)
  await printCardsPdf({
    template: opts.template,
    codes: opts.codes,
    title: opts.title,
  });
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
  c.width = W;
  c.height = H;
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
    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < buf.length; i += CHUNK)
      bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
    return btoa(bin);
  };
  const vfs = Object.fromEntries(
    await Promise.all(
      Object.entries(FONT_URLS).map(async ([n, u]) => [n, await toB64(u)] as const),
    ),
  );
  if (typeof pdfMake.addVirtualFileSystem === "function") pdfMake.addVirtualFileSystem(vfs);
  else pdfMake.vfs = { ...(pdfMake.vfs || {}), ...vfs };
  const FONTS = {
    Cairo: {
      normal: "Cairo-Regular.ttf",
      bold: "Cairo-Bold.ttf",
      italics: "Cairo-Regular.ttf",
      bolditalics: "Cairo-Bold.ttf",
    },
  };
  if (typeof pdfMake.addFonts === "function") pdfMake.addFonts(FONTS);
  else pdfMake.fonts = { ...(pdfMake.fonts || {}), ...FONTS };

  const dateStr = new Date().toLocaleString("ar-EG-u-nu-latn", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const doc: any = {
    pageSize: "A4",
    pageMargins: [20, 24, 20, 24],
    defaultStyle: { font: "Cairo", fontSize: 10 },
    content: [
      {
        columns: [
          { text: title, alignment: "right", bold: true, fontSize: 12 },
          {
            text: `${codes.length} كرت — ${dateStr}`,
            alignment: "left",
            fontSize: 9,
            color: "#64748b",
          },
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
      const cb = (buf: any) => {
        const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf?.buffer ?? buf);
        resolve(new Blob([u8], { type: "application/pdf" }));
      };
      const maybe: any = pdfMake.createPdf(doc).getBuffer(cb);
      if (maybe && typeof maybe.then === "function") maybe.then(cb).catch(reject);
    } catch (e) {
      reject(e);
    }
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

/** طباعة كشف الكروت المسحوبة كملف PDF عبر pdfmake */
export async function printAssignedCards(opts: {
  rows: AssignedCardRow[];
  title?: string;
  networkName?: string;
  autoPrint?: boolean;
}): Promise<void> {
  const { rows, title = "كشف الكروت المسحوبة", networkName = "" } = opts;

  const fmtDate = (d?: string | null) => {
    if (!d) return "—";
    try {
      return new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(d));
    } catch {
      return "—";
    }
  };
  const printedAt = fmtDate(new Date().toISOString());
  const total = rows.length;

  // ملخص حسب المندوب
  const byAgent = new Map<string, number>();
  rows.forEach((r) =>
    byAgent.set(r.agent_name || "—", (byAgent.get(r.agent_name || "—") ?? 0) + 1),
  );

  // pdfmake setup (نفس آلية printCardsPdf)
  const pdfMakeMod: any = await import("pdfmake/build/pdfmake");
  const pdfMake: any = pdfMakeMod.default ?? pdfMakeMod;
  const FONT_URLS: Record<string, string> = {
    "Cairo-Regular.ttf":
      "https://fonts.gstatic.com/s/cairo/v31/SLXgc1nY6HkvangtZmpQdkhzfH5lkSs2SgRjCAGMQ1z0hOA-W1Q.ttf",
    "Cairo-Bold.ttf":
      "https://fonts.gstatic.com/s/cairo/v31/SLXgc1nY6HkvangtZmpQdkhzfH5lkSs2SgRjCAGMQ1z0hAc5W1Q.ttf",
  };
  const toB64 = async (u: string) => {
    const r = await fetch(u);
    const buf = new Uint8Array(await r.arrayBuffer());
    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < buf.length; i += CHUNK)
      bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
    return btoa(bin);
  };
  const vfs = Object.fromEntries(
    await Promise.all(
      Object.entries(FONT_URLS).map(async ([n, u]) => [n, await toB64(u)] as const),
    ),
  );
  if (typeof pdfMake.addVirtualFileSystem === "function") pdfMake.addVirtualFileSystem(vfs);
  else pdfMake.vfs = { ...(pdfMake.vfs || {}), ...vfs };
  const FONTS = {
    Cairo: {
      normal: "Cairo-Regular.ttf",
      bold: "Cairo-Bold.ttf",
      italics: "Cairo-Regular.ttf",
      bolditalics: "Cairo-Bold.ttf",
    },
  };
  if (typeof pdfMake.addFonts === "function") pdfMake.addFonts(FONTS);
  else pdfMake.fonts = { ...(pdfMake.fonts || {}), ...FONTS };

  // reshape helper (نفس ar() في pdfmake-report): يعكس ترتيب الكلمات فقط
  const ARABIC_CHAR = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
  const ar = (v: any): string => {
    if (v == null) return "";
    const s = sanitizePdfText(String(v));
    if (!ARABIC_CHAR.test(s)) return s;
    return s.split(/(\s+)/).reverse().join("");
  };


  const header = [
    { text: ar("#"), style: "th", alignment: "center" },
    { text: ar("الكود"), style: "th" },
    { text: ar("اسم المستخدم"), style: "th" },
    { text: ar("الفئة"), style: "th" },
    { text: ar("المندوب"), style: "th" },
    { text: ar("تاريخ السحب"), style: "th", alignment: "center" },
  ];
  const body: any[][] = [header];
  rows.forEach((r, i) => {
    body.push([
      { text: String(i + 1), alignment: "center" },
      { text: String(r.code ?? ""), alignment: "center", noWrap: true },
      { text: ar(r.username ?? "") },
      { text: ar(r.package_name ?? "") },
      { text: ar(r.agent_name ?? "") },
      { text: fmtDate(r.assigned_at), alignment: "center", fontSize: 9 },
    ]);
  });
  if (rows.length === 0) {
    body.push([
      {
        text: ar("لا توجد بيانات"),
        colSpan: 6,
        alignment: "center",
        color: "#6b7280",
        margin: [0, 8, 0, 8],
      } as any,
      {},
      {},
      {},
      {},
      {},
    ]);
  }

  const summaryChips = Array.from(byAgent.entries()).map(([n, c]) => ({
    text: `${ar(n)}: ${c}`,
    style: "chip",
    margin: [0, 0, 4, 4],
  }));

  const doc: any = {
    pageSize: "A4",
    pageMargins: [24, 28, 24, 28],
    defaultStyle: { font: "Cairo", fontSize: 10, alignment: "right" },
    content: [
      {
        columns: [
          {
            stack: [
              { text: ar(title), bold: true, fontSize: 16, color: "#1e3a8a" },
              networkName
                ? {
                    text: `${ar("الشبكة")}: ${ar(networkName)}`,
                    fontSize: 11,
                    color: "#374151",
                    margin: [0, 2, 0, 0],
                  }
                : {},
            ],
          },
          {
            width: "auto",
            alignment: "left",
            stack: [
              { text: `${ar("تاريخ الطباعة")}: ${printedAt}`, fontSize: 9, color: "#374151" },
              {
                text: `${ar("إجمالي الكروت")}: ${total}`,
                fontSize: 10,
                bold: true,
                color: "#0f172a",
                margin: [0, 2, 0, 0],
              },
            ],
          },
        ],
        margin: [0, 0, 0, 8],
      },
      {
        canvas: [
          { type: "line", x1: 0, y1: 0, x2: 547, y2: 0, lineWidth: 1.5, lineColor: "#1e3a8a" },
        ],
        margin: [0, 0, 0, 8],
      },
      summaryChips.length ? { columns: summaryChips, margin: [0, 0, 0, 8] } : { text: "" },
      {
        table: { widths: [22, "*", "*", "*", "*", 70], headerRows: 1, body },
        layout: {
          hLineWidth: () => 0.6,
          vLineWidth: () => 0.6,
          hLineColor: () => "#1f2937",
          vLineColor: () => "#1f2937",
          fillColor: (rowIndex: number) =>
            rowIndex === 0 ? "#1e3a8a" : rowIndex % 2 === 0 ? "#f8fafc" : null,
        },
      },
      {
        columns: [
          {
            text: ar("توقيع المندوب"),
            alignment: "center",
            margin: [0, 30, 0, 0],
            decoration: "overline",
          },
          {
            text: ar("توقيع المدير"),
            alignment: "center",
            margin: [0, 30, 0, 0],
            decoration: "overline",
          },
        ],
      },
    ],
    styles: {
      th: { color: "#ffffff", bold: true, fontSize: 10, margin: [0, 3, 0, 3] },
      chip: { fontSize: 9, color: "#1e3a8a" },
    },
  };

  const blob: Blob = await new Promise((resolve, reject) => {
    try {
      const cb = (buf: any) => {
        const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf?.buffer ?? buf);
        resolve(new Blob([u8], { type: "application/pdf" }));
      };
      const maybe: any = pdfMake.createPdf(doc).getBuffer(cb);
      if (maybe && typeof maybe.then === "function") maybe.then(cb).catch(reject);
    } catch (e) {
      reject(e);
    }
  });

  const { sharePdfBlob } = await import("./native-pdf");
  await sharePdfBlob({ blob, filename: title, dialogTitle: "طباعة أو مشاركة كشف الكروت المسحوبة" });
}
