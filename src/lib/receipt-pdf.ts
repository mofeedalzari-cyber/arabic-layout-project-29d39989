// receipt-pdf.ts
// Formal Arabic credit-notice receipt (سند إشعار دائن) matching the reference layout.
import type { TDocumentDefinitions } from "pdfmake/interfaces";
import { ar } from "./pdfmake-report";

// pdfmake + font loader are reused via a private helper module pattern.
// We duplicate the minimal loader here to avoid circular refactors.
const FONT_URLS: Record<string, string> = {
  "Cairo-Regular.ttf":
    "https://fonts.gstatic.com/s/cairo/v31/SLXgc1nY6HkvangtZmpQdkhzfH5lkSs2SgRjCAGMQ1z0hOA-W1Q.ttf",
  "Cairo-Bold.ttf":
    "https://fonts.gstatic.com/s/cairo/v31/SLXgc1nY6HkvangtZmpQdkhzfH5lkSs2SgRjCAGMQ1z0hAc5W1Q.ttf",
};

let _vfsCache: Record<string, string> | null = null;
async function fetchAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`font ${url} ${res.status}`);
  const buf = await res.arrayBuffer();
  let bin = "";
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}
async function loadFontsVfs() {
  if (_vfsCache) return _vfsCache;
  const entries = await Promise.all(
    Object.entries(FONT_URLS).map(async ([n, u]) => [n, await fetchAsBase64(u)] as const),
  );
  _vfsCache = Object.fromEntries(entries);
  return _vfsCache;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _pdfMake: any = null;
async function getPdfMake() {
  if (_pdfMake) return _pdfMake;
  const mod: any = await import("pdfmake/build/pdfmake");
  _pdfMake = mod.default ?? mod;
  return _pdfMake;
}

const FONTS = {
  Cairo: {
    normal: "Cairo-Regular.ttf",
    bold: "Cairo-Bold.ttf",
    italics: "Cairo-Regular.ttf",
    bolditalics: "Cairo-Bold.ttf",
  },
};

// ---------- Arabic number-to-words (integers up to millions) ----------
const ONES = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة",
  "عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
const TENS = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const HUNDREDS = ["", "مائة", "مئتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];

function under1000(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rem = n % 100;
  if (h) parts.push(HUNDREDS[h]);
  if (rem < 20) { if (rem) parts.push(ONES[rem]); }
  else {
    const o = rem % 10, t = Math.floor(rem / 10);
    if (o) parts.push(`${ONES[o]} و${TENS[t]}`);
    else parts.push(TENS[t]);
  }
  return parts.join(" و");
}

function numberToArabicWords(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "صفر";
  const parts: string[] = [];
  const mil = Math.floor(n / 1_000_000);
  const th = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  if (mil) {
    if (mil === 1) parts.push("مليون");
    else if (mil === 2) parts.push("مليونان");
    else if (mil <= 10) parts.push(`${ONES[mil]} ملايين`);
    else parts.push(`${under1000(mil)} مليون`);
  }
  if (th) {
    if (th === 1) parts.push("ألف");
    else if (th === 2) parts.push("ألفان");
    else if (th <= 10) parts.push(`${ONES[th]} آلاف`);
    else parts.push(`${under1000(th)} ألف`);
  }
  if (rest) parts.push(under1000(rest));
  return parts.join(" و");
}

function currencyWord(currency: string): string {
  const c = (currency || "").trim();
  if (!c) return "ريال";
  if (/سعودي|SAR|ر\.س/i.test(c)) return "ريال سعودي";
  if (/يمني|YER/i.test(c)) return "ريال يمني";
  if (/دولار|USD/i.test(c)) return "دولار أمريكي";
  return c;
}

function nextReceiptNumber(): number {
  try {
    const key = "karti_receipt_counter";
    const cur = Number(localStorage.getItem(key) || "1570");
    const next = cur + 1;
    localStorage.setItem(key, String(next));
    return next;
  } catch {
    return Math.floor(Date.now() / 1000) % 10000;
  }
}

// ---------- Receipt builder ----------
export type CreditReceiptInput = {
  networkName: string;
  networkPhone: string;
  networkRegion?: string; // e.g. "الجمهورية اليمنية - حيران"
  agentName: string;
  amount: number;
  currency: string;
  statement: string; // البيان
  dateStr: string;
  adminName: string;
  adminUsername?: string;
};

const LINE = "#000000";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cell(text: string, opts: any = {}): any {
  return {
    text: ar(text),
    direction: "rtl",
    alignment: opts.alignment || "center",
    bold: opts.bold ?? false,
    color: opts.color || "#000000",
    fontSize: opts.fontSize ?? 11,
    fillColor: opts.fillColor,
    margin: opts.margin || [4, 6, 4, 6],
    border: opts.border,
    colSpan: opts.colSpan,
  };
}

export async function buildCreditReceiptPdfBlob(input: CreditReceiptInput): Promise<Blob> {
  const [pdfMake, vfs] = await Promise.all([getPdfMake(), loadFontsVfs()]);
  if (typeof pdfMake.addVirtualFileSystem === "function") pdfMake.addVirtualFileSystem(vfs);
  else pdfMake.vfs = { ...(pdfMake.vfs || {}), ...vfs };
  if (typeof pdfMake.addFonts === "function") pdfMake.addFonts(FONTS);
  else pdfMake.fonts = { ...(pdfMake.fonts || {}), ...FONTS };

  const receiptNo = nextReceiptNumber();
  const amountInt = Math.floor(input.amount);
  const words = `${numberToArabicWords(amountInt)} ${currencyWord(input.currency)} فقط لا غير`;
  const curLabel = currencyWord(input.currency);
  const region = input.networkRegion || "";

  // ---------- Header (two columns) ----------
  const headerRow = {
    columns: [
      // Left column (Latin/summary)
      {
        width: "*",
        stack: [
          { text: (input.adminUsername || "").toUpperCase() || "—", fontSize: 12, bold: true, alignment: "left" },
          { text: region ? "YEMEN" : "", fontSize: 11, alignment: "left" },
          { text: input.networkPhone ? `+${input.networkPhone.replace(/^\+/, "")}` : "", fontSize: 11, alignment: "left" },
        ],
      },
      // Right column (Arabic)
      {
        width: "*",
        stack: [
          { text: ar(input.networkName), direction: "rtl", fontSize: 13, bold: true, alignment: "right" },
          { text: ar(region), direction: "rtl", fontSize: 11, alignment: "right" },
          { text: ar(`+967 ${input.networkPhone}`.trim()), direction: "rtl", fontSize: 11, alignment: "right" },
        ],
      },
    ],
    margin: [0, 0, 0, 8],
  };

  // ---------- Title box (centered) ----------
  const titleBox = {
    table: {
      widths: [160],
      body: [[cell("سند إشعار دائن", { bold: true, fontSize: 12, margin: [6, 4, 6, 4] })]],
    },
    layout: {
      hLineColor: () => LINE, vLineColor: () => LINE,
      hLineWidth: () => 1, vLineWidth: () => 1,
    },
    alignment: "center",
    margin: [0, 0, 0, 10],
  };

  // ---------- Date / Title / Number row ----------
  const metaRow = {
    table: {
      widths: ["*", "*", "*"],
      body: [[
        cell(`الرقم: ${receiptNo}`, { bold: true, color: "#1e3a8a", alignment: "center" }),
        cell("سند إشعار دائن", { bold: true, fontSize: 14, alignment: "center" }),
        cell(`التاريخ : ${input.dateStr}`, { bold: true, color: "#1e3a8a", alignment: "center" }),
      ]],
    },
    layout: {
      hLineColor: () => LINE, vLineColor: () => LINE,
      hLineWidth: () => 1, vLineWidth: () => 1,
    },
    margin: [0, 0, 0, 8],
  };

  // ---------- Recipient line ----------
  const recipientRow = {
    columns: [
      { width: "*", text: ar("المحترم"), direction: "rtl", alignment: "left", bold: true },
      { width: "*", text: ar(`إستلمت من الأخ الفاضل   /   ${input.agentName}`), direction: "rtl", alignment: "right", bold: true },
    ],
    margin: [4, 4, 4, 6],
  };

  const introRow = {
    text: ar("نود اشعاركم اننا قيدنا الى حسابكم لدينا حسب التفاصيل التالية"),
    direction: "rtl",
    alignment: "right",
    margin: [4, 0, 4, 8],
  };

  // ---------- Amount table ----------
  const amountTable = {
    table: {
      widths: ["*", "*", "*"],
      body: [
        [
          cell("العملة  " + curLabel, { color: "#1e3a8a", bold: true }),
          cell(`${amountInt.toLocaleString("en-US")} ${curLabel.includes("سعودي") ? "ريال ر.س." : curLabel}`, { bold: true }),
          cell("المبلغ", { color: "#1e3a8a", bold: true }),
        ],
        [cell(words, { colSpan: 3, alignment: "center", bold: true, margin: [4, 6, 4, 6] }), {}, {}],
        [cell("البيــــــــان", { colSpan: 3, alignment: "center", bold: true, color: "#1e3a8a", margin: [4, 6, 4, 6] }), {}, {}],
        [cell(input.statement || `تسديد من ${input.agentName}`, { colSpan: 3, alignment: "right", margin: [10, 10, 10, 24] }), {}, {}],
      ],
    },
    layout: {
      hLineColor: () => LINE, vLineColor: () => LINE,
      hLineWidth: () => 1, vLineWidth: () => 1,
    },
    margin: [0, 0, 0, 20],
  };

  // ---------- Signatures ----------
  const signatures = {
    columns: [
      { width: "*", stack: [{ text: ar(input.adminName), direction: "rtl", alignment: "center", margin: [0, 0, 0, 2] }, { text: ar("مستلم الكروت"), direction: "rtl", alignment: "center", bold: true }] },
      { width: "*", stack: [{ text: ar("كروت"), direction: "rtl", alignment: "center", margin: [0, 0, 0, 2] }, { text: ar("مندوب"), direction: "rtl", alignment: "center", bold: true }] },
      { width: "*", stack: [{ text: " ", margin: [0, 0, 0, 2] }, { text: ar(`مدير ${input.networkName}`), direction: "rtl", alignment: "center", bold: true }] },
    ],
    margin: [0, 20, 0, 0],
  };

  const doc: TDocumentDefinitions = {
    pageSize: "A4",
    pageMargins: [30, 30, 30, 40],
    defaultStyle: { font: "Cairo", fontSize: 11 },
    content: [headerRow, titleBox, metaRow, recipientRow, introRow, amountTable, signatures],
    footer: (cp: number, tp: number) => ({
      margin: [30, 0, 30, 0],
      columns: [
        { text: ar("© كرتي"), direction: "rtl", alignment: "left", fontSize: 8, color: "#64748b" },
        { text: ar(`صفحة ${cp} / ${tp}`), direction: "rtl", alignment: "center", fontSize: 8, color: "#64748b" },
        { text: ar("برمجة وتصميم مفيد الزري"), direction: "rtl", alignment: "right", fontSize: 8, color: "#0f766e", bold: true },
      ],
    }),
  };

  const pdf = pdfMake.createPdf(doc);
  return await new Promise<Blob>((resolve, reject) => {
    try {
      const cb = (buffer: any) => {
        try {
          const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer?.buffer ?? buffer);
          resolve(new Blob([u8], { type: "application/pdf" }));
        } catch (e) { reject(e); }
      };
      const maybe = pdf.getBuffer(cb);
      if (maybe && typeof maybe.then === "function") maybe.then(cb).catch(reject);
    } catch (e) { reject(e); }
  });
}
