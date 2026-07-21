// pdfmake-report.ts
// Helper for generating Arabic (RTL) PDF reports using pdfmake.
// pdfmake + Amiri/fontkit shape Arabic glyphs, but browser/pdfkit rendering in
// this build visually reverses Arabic word order. We compensate at word level
// only, never character level, so letters stay connected and words read right.

import type { TDocumentDefinitions, TFontDictionary } from "pdfmake/interfaces";

// -----------------------------------------------------------------------------
// Arabic / RTL helpers
// -----------------------------------------------------------------------------

const ARABIC_CHAR = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
const RTL_EMBED = "\u202B";
const POP_DIRECTIONAL = "\u202C";
const ARABIC_WORD = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]+/;

function reverseArabicWordOrder(value: string): string {
  return value
    .split(/(\n)/)
    .map((line) => {
      if (line === "\n" || !ARABIC_CHAR.test(line)) return line;
      const tokens = line.match(/\S+|\s+/g) ?? [line];
      const words = tokens.filter((token) => /\S/.test(token));
      if (words.filter((word) => ARABIC_WORD.test(word)).length <= 1) return line;

      let wordIndex = words.length - 1;
      const reversedTokens = tokens
        .map((token) => {
          if (/\s/.test(token)) return token;
          return words[wordIndex--] ?? token;
        });

      // pdfmake visually compresses/overlaps normal Arabic spaces after bidi
      // compensation. A double space in the source renders as a normal readable
      // word gap in the final PDF without altering the actual Arabic letters.
      return reversedTokens
        .map((token, index) => {
          if (!/\s/.test(token)) return token;
          const prev = reversedTokens[index - 1] ?? "";
          const next = reversedTokens[index + 1] ?? "";
          return ARABIC_WORD.test(prev) && ARABIC_WORD.test(next) ? "  " : token;
        })
        .join("");
    })
    .join("");
}

/**
 * Keep Arabic letters inside each word in normal order, but reverse whole-word
 * order to counter pdfmake's visual reversal in generated PDFs.
 */
export function ar(input: string | number | null | undefined): string {
  if (input == null) return "";
  const value = String(input);
  return ARABIC_CHAR.test(value)
    ? `${RTL_EMBED}${reverseArabicWordOrder(value)}${POP_DIRECTIONAL}`
    : value;
}

function rtlText(input: string | number | null | undefined): string {
  return ar(input);
}

// -----------------------------------------------------------------------------
// Font loading (Amiri from jsDelivr, cached in-memory as base64)
// -----------------------------------------------------------------------------

const FONT_URLS: Record<string, string> = {
  "Amiri-Regular.ttf":
    "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/amiri/Amiri-Regular.ttf",
  "Amiri-Bold.ttf":
    "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/amiri/Amiri-Bold.ttf",
};

let _vfsCache: Record<string, string> | null = null;

async function fetchAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch font: ${url} (${res.status})`);
  const buf = await res.arrayBuffer();
  let bin = "";
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

async function loadFontsVfs(): Promise<Record<string, string>> {
  if (_vfsCache) return _vfsCache;
  const entries = await Promise.all(
    Object.entries(FONT_URLS).map(async ([name, url]) => {
      const b64 = await fetchAsBase64(url);
      return [name, b64] as const;
    }),
  );
  _vfsCache = Object.fromEntries(entries);
  return _vfsCache;
}

// -----------------------------------------------------------------------------
// pdfmake loader
// -----------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _pdfMake: any = null;
async function getPdfMake() {
  if (_pdfMake) return _pdfMake;
  const mod: any = await import("pdfmake/build/pdfmake");
  _pdfMake = mod.default ?? mod;
  return _pdfMake;
}

const FONTS: TFontDictionary = {
  Amiri: {
    normal: "Amiri-Regular.ttf",
    bold: "Amiri-Bold.ttf",
    italics: "Amiri-Regular.ttf",
    bolditalics: "Amiri-Bold.ttf",
  },
};

async function createPdf(docDefinition: TDocumentDefinitions): Promise<Blob> {
  const [pdfMake, vfs] = await Promise.all([getPdfMake(), loadFontsVfs()]);
  // pdfmake 0.3 no longer reads `pdfMake.vfs = ...` reliably in the browser.
  // The fonts must be registered into its virtual file system before createPdf().
  if (typeof pdfMake.addVirtualFileSystem === "function") {
    pdfMake.addVirtualFileSystem(vfs);
  } else {
    pdfMake.vfs = { ...(pdfMake.vfs || {}), ...vfs };
  }

  if (typeof pdfMake.addFonts === "function") {
    pdfMake.addFonts(FONTS);
  } else if (typeof pdfMake.setFonts === "function") {
    pdfMake.setFonts(FONTS);
  } else {
    pdfMake.fonts = { ...(pdfMake.fonts || {}), ...FONTS };
  }

  const doc = pdfMake.createPdf({
    defaultStyle: { font: "Amiri", fontSize: 11 },
    ...docDefinition,
  });

  // pdfmake 0.3's getBlob() spawns a Web Worker from a Blob URL, which is
  // blocked in Android WebView (Capacitor) and yields an empty/failed result.
  // getBuffer() runs synchronously on the main thread and works everywhere.
  return await new Promise<Blob>((resolve, reject) => {
    try {
      const cb = (buffer: any) => {
        try {
          const u8 =
            buffer instanceof Uint8Array
              ? buffer
              : new Uint8Array(buffer?.buffer ?? buffer);
          resolve(new Blob([u8], { type: "application/pdf" }));
        } catch (e) {
          reject(e);
        }
      };
      const maybe = doc.getBuffer(cb);
      if (maybe && typeof maybe.then === "function") {
        maybe.then(cb).catch(reject);
      }
    } catch (err) {
      reject(err);
    }
  });

}

// -----------------------------------------------------------------------------
// High-level report builder
// -----------------------------------------------------------------------------

export type PdfSummaryRow = { label: string; value: string | number };
export type PdfTableSection = {
  title: string;
  cols: string[];
  rows: (string | number)[][];
};
export type PdfReportMeta = {
  reportName?: string;
  branch?: string;
  user?: string;
  systemName?: string;
};

const COLORS = {
  ink: "#0f172a",
  inkSoft: "#334155",
  muted: "#64748b",
  line: "#e2e8f0",
  lineStrong: "#cbd5e1",
  header: "#f1f5f9",
  altRow: "#f8fafc",
  brand: "#0f766e",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function headerBlock(title: string, meta: Required<PdfReportMeta>, dateStr: string): any {
  return {
    columns: [
      {
        width: 60,
        stack: [
          {
            table: {
              widths: [50],
              body: [
                [
                  {
                    text: ar("ك"),
                    alignment: "center",
                    color: "#ffffff",
                    bold: true,
                    fontSize: 24,
                    fillColor: COLORS.brand,
                    margin: [0, 10, 0, 10],
                  },
                ],
              ],
            },
            layout: "noBorders",
          },
        ],
      },
      {
        width: "*",
        stack: [
          { text: rtlText(meta.systemName), direction: "rtl", fontSize: 13, bold: true, color: COLORS.ink, alignment: "right" },
          { text: rtlText(meta.reportName || title), direction: "rtl", fontSize: 16, bold: true, color: COLORS.brand, alignment: "right", margin: [0, 4, 0, 0] },
        ],
      },
      {
        width: 200,
        stack: [
          { text: rtlText(`التاريخ: ${dateStr}`), direction: "rtl", fontSize: 9, color: COLORS.muted, alignment: "right" },
          { text: rtlText(`الفرع / الشبكة: ${meta.branch}`), direction: "rtl", fontSize: 9, color: COLORS.muted, alignment: "right", margin: [0, 3, 0, 0] },
          { text: rtlText(`المستخدم: ${meta.user}`), direction: "rtl", fontSize: 9, color: COLORS.muted, alignment: "right", margin: [0, 3, 0, 0] },
        ],
      },
    ],
    columnGap: 12,
    margin: [0, 0, 0, 10],
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function summaryBlock(summary: PdfSummaryRow[]): any {
  if (!summary.length) return null;
  return {
    stack: [
      {
        text: rtlText("ملخص التقرير"),
        direction: "rtl",
        fillColor: COLORS.header,
        color: COLORS.ink,
        bold: true,
        fontSize: 12,
        margin: [10, 6, 10, 6],
        alignment: "right",
      },
      {
        table: {
          widths: ["*", "*"],
          body: summary.map((s) => [
            {
              text: rtlText(s.value),
              direction: "rtl",
              alignment: "center",
              bold: true,
              color: COLORS.ink,
              margin: [6, 5, 6, 5],
            },
            {
              text: rtlText(s.label),
              direction: "rtl",
              alignment: "right",
              color: COLORS.inkSoft,
              fillColor: "#fafafa",
              margin: [10, 5, 10, 5],
            },
          ]),
        },
        layout: {
          hLineColor: () => COLORS.line,
          vLineColor: () => COLORS.line,
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
        },
      },
    ],
    margin: [0, 0, 0, 14],
    unbreakable: false,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tableSection(sec: PdfTableSection): any {
  const cols = ["#", ...sec.cols];
  const widths: (string | number)[] = [24, ...sec.cols.map(() => "*")];

  const header = cols
    .slice()
    .reverse()
    .map((c) => ({
      text: rtlText(c),
      direction: "rtl",
      bold: true,
      color: COLORS.ink,
      fillColor: COLORS.header,
      alignment: "right",
      margin: [4, 6, 4, 6],
      fontSize: 10,
    }));

  const body = sec.rows.length
    ? sec.rows.map((row, i) => {
        const cells = [i + 1, ...row].reverse().map((c) => ({
          text: rtlText(c),
          direction: "rtl",
          alignment: /^-?\d/.test(String(c).trim()) ? "center" : "right",
          margin: [4, 4, 4, 4],
          fontSize: 9.5,
          color: COLORS.ink,
        }));
        return cells;
      })
    : [
        [
          {
            text: rtlText("— لا توجد بيانات —"),
            direction: "rtl",
            colSpan: cols.length,
            alignment: "center",
            italics: true,
            color: COLORS.muted,
            margin: [4, 8, 4, 8],
          } as any,
          ...new Array(cols.length - 1).fill({}),
        ],
      ];

  return {
    stack: [
      {
        columns: [
          {
            width: "auto",
            text: `${sec.rows.length}`,
            color: COLORS.brand,
            bold: true,
            fontSize: 10,
            alignment: "left",
            margin: [6, 6, 0, 6],
          },
          {
            width: "*",
            text: rtlText(sec.title),
            direction: "rtl",
            bold: true,
            color: COLORS.ink,
            fillColor: COLORS.header,
            fontSize: 11,
            alignment: "right",
            margin: [10, 6, 10, 6],
          },
        ],
        columnGap: 0,
      },
      {
        table: {
          widths: widths.slice().reverse(),
          headerRows: 1,
          body: [header, ...body],
        },
        layout: {
          fillColor: (rowIdx: number) => (rowIdx > 0 && rowIdx % 2 === 0 ? COLORS.altRow : null),
          hLineColor: () => COLORS.line,
          vLineColor: () => COLORS.line,
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
        },
      },
    ],
    margin: [0, 0, 0, 14],
  };
}

export async function buildReportPdfBlob(opts: {
  title: string;
  summary: PdfSummaryRow[];
  sections: PdfTableSection[];
  meta?: PdfReportMeta;
}): Promise<Blob> {
  const meta: Required<PdfReportMeta> = {
    systemName: opts.meta?.systemName || "كرتي — نظام إدارة الشبكات والمناديب",
    reportName: opts.meta?.reportName || opts.title,
    branch: opts.meta?.branch || "—",
    user: opts.meta?.user || "—",
  };
  const dateStr = new Date().toLocaleString("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
  });


  const content: any[] = [
    headerBlock(opts.title, meta, dateStr),
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1.2, lineColor: COLORS.brand }], margin: [0, 0, 0, 10] },
  ];
  const sum = summaryBlock(opts.summary);
  if (sum) content.push(sum);
  for (const sec of opts.sections) content.push(tableSection(sec));

  const doc: TDocumentDefinitions = {
    pageSize: "A4",
    pageMargins: [30, 36, 30, 42],
    content,
    footer: (currentPage: number, pageCount: number) => ({
      margin: [30, 0, 30, 0],
      columns: [
        {
      text: rtlText("© كرتي"),
      direction: "rtl",
          alignment: "left",
          fontSize: 8,
          color: COLORS.muted,
        },
        {
          text: rtlText(`صفحة ${currentPage} / ${pageCount}`),
          direction: "rtl",
          alignment: "center",
          fontSize: 8,
          color: COLORS.muted,
        },
        {
          text: rtlText("برمجة وتصميم مفيد الزري"),
          direction: "rtl",
          alignment: "right",
          fontSize: 8,
          color: COLORS.brand,
          bold: true,
        },
      ],
    }),
  };

  return createPdf(doc);
}
