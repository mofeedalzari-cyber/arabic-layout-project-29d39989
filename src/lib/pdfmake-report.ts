// pdfmake-report.ts
// Helper for generating Arabic (RTL) PDF reports using pdfmake.
// pdfmake + Cairo/fontkit shape Arabic glyphs, but browser/pdfkit rendering in
// this build places whitespace-separated RTL tokens in reverse visual order.
// Compensate at word level only; never reverse characters inside a word.

import type { TDocumentDefinitions, TFontDictionary } from "pdfmake/interfaces";

// -----------------------------------------------------------------------------
// Arabic / RTL helpers
// -----------------------------------------------------------------------------

const ARABIC_CHAR = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

/**
 * The embedded Cairo subset has no glyph for the Saudi Riyal sign (U+FDFC) or
 * for zero-width/soft markers, so those render as tofu boxes ("أحرف غريبة").
 * Normalize them before shaping.
 */
export function sanitizePdfText(value: string): string {
  return value
    .replace(/\uFDFC/g, "ر.س")
    .replace(/[\u200B\u200C\u200D\u200E\u200F\u061C\u2060\uFEFF\u00AD]/g, "")
    .replace(/\u00A0/g, " ");
}

export function ar(input: string | number | null | undefined): string {
  if (input == null) return "";
  const raw = String(input);
  // Non-breaking spaces mark multi-word names that must stay on one line.
  // pdfmake treats an NBSP-joined name as one RTL run and already preserves
  // its logical word order, so reversing that run would turn
  // "عبداللطيف محمد مرعي" into "مرعي محمد عبداللطيف".
  const keepNoWrap = raw.includes("\u00A0");
  const value = sanitizePdfText(raw).trim();
  if (!ARABIC_CHAR.test(value)) return value;

  if (keepNoWrap) return value.split(/\s+/).join("\u00A0");

  // pdfmake reverses the visual placement of Arabic tokens. Supplying the
  // tokens in reverse logical order makes the final PDF read correctly:
  // "ماجد حميد احمد الحائط" is rendered visually in that same order.
  return value.split(/\s+/).reverse().join(" ");
}




function rtlText(input: string | number | null | undefined): string {
  return ar(input);
}

// -----------------------------------------------------------------------------
// Font loading (Amiri from jsDelivr, cached in-memory as base64)
// -----------------------------------------------------------------------------

const FONT_URLS: Record<string, string> = {
  "Cairo-Regular.ttf":
    "https://fonts.gstatic.com/s/cairo/v31/SLXgc1nY6HkvangtZmpQdkhzfH5lkSs2SgRjCAGMQ1z0hOA-W1Q.ttf",
  "Cairo-Bold.ttf":
    "https://fonts.gstatic.com/s/cairo/v31/SLXgc1nY6HkvangtZmpQdkhzfH5lkSs2SgRjCAGMQ1z0hAc5W1Q.ttf",
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
  Cairo: {
    normal: "Cairo-Regular.ttf",
    bold: "Cairo-Bold.ttf",
    italics: "Cairo-Regular.ttf",
    bolditalics: "Cairo-Bold.ttf",
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
    defaultStyle: { font: "Cairo", fontSize: 11 },
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
            buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer?.buffer ?? buffer);
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
  userRole?: string;
  systemName?: string;
};

const COLORS = {
  ink: "#0f172a",
  inkSoft: "#334155",
  muted: "#64748b",
  line: "#334155",
  lineStrong: "#0f172a",
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
          {
            text: rtlText(meta.systemName),
            direction: "rtl",
            fontSize: 13,
            bold: true,
            color: COLORS.ink,
            alignment: "right",
          },
          {
            text: rtlText(meta.reportName || title),
            direction: "rtl",
            fontSize: 16,
            bold: true,
            color: COLORS.brand,
            alignment: "right",
            margin: [0, 4, 0, 0],
          },
        ],
      },
      {
        width: 200,
        stack: [
          {
            text: rtlText(`التاريخ: ${dateStr}`),
            direction: "rtl",
            fontSize: 9,
            color: COLORS.muted,
            alignment: "right",
          },
          {
            text: rtlText(`الفرع / الشبكة: ${meta.branch}`),
            direction: "rtl",
            fontSize: 9,
            color: COLORS.muted,
            alignment: "right",
            margin: [0, 3, 0, 0],
          },
          {
            text: rtlText(`${meta.userRole}: ${meta.user}`),
            direction: "rtl",
            fontSize: 9,
            color: COLORS.muted,
            alignment: "right",
            margin: [0, 3, 0, 0],
          },
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
          hLineWidth: () => 1,
          vLineWidth: () => 1,
        },
      },
    ],
    margin: [0, 0, 0, 14],
    unbreakable: false,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tableSection(sec: PdfTableSection, dense = false): any {
  const cols = ["#", ...sec.cols];
  // Columns that need narrow width + tight padding + character wrapping
  const NARROW_HEADERS = new Set(["رقم العملية", "الكرت", "السعر", "التاريخ"]);
  const isNarrow = (idx: number) =>
    idx > 0 && NARROW_HEADERS.has(String(sec.cols[idx - 1] ?? "").trim());
  const narrowWidthFor = (idx: number) => {
    const h = String(sec.cols[idx - 1] ?? "").trim();
    if (h === "السعر") return dense ? 38 : 48;
    if (h === "التاريخ") return dense ? 74 : 92;
    if (h === "رقم العملية") return dense ? 62 : 78;
    return dense ? 44 : 56;
  };
  const widths: (string | number)[] = [
    dense ? 12 : 18,
    ...sec.cols.map((_, i) => (isNarrow(i + 1) ? narrowWidthFor(i + 1) : "*")),
  ];
  const headPad = dense ? [1, 3, 1, 3] : [3, 5, 3, 5];
  const cellPad = dense ? [1, 2, 1, 2] : [3, 4, 3, 4];
  const narrowHeadPad = dense ? [1, 3, 1, 3] : [2, 5, 2, 5];
  const narrowCellPad = dense ? [1, 2, 1, 2] : [2, 4, 2, 4];
  const headSize = dense ? 7.5 : 10;
  const cellSize = dense ? 7 : 9.5;
  const narrowCellSize = dense ? 6.5 : 8.5;

  // Break long non-Arabic tokens (transaction ids, card numbers) with real line
  // breaks. Zero-width spaces were used before, but the embedded Cairo subset
  // has no glyph for U+200B so they printed as tofu boxes inside the values.
  const wrapLongToken = (s: string, every = 6) => {
    const str = sanitizePdfText(String(s ?? ""));
    if (ARABIC_CHAR.test(str)) return str;
    return str
      .split(/( +)/)
      .map((tok) => {
        if (!tok.trim() || tok.length <= every + 2) return tok;
        // Prefer breaking at separators, then hard-chunk anything still too long.
        return tok
          .split(/(?<=[-_/])/)
          .map((part) =>
            part.length > every + 2
              ? (part.match(new RegExp(`.{1,${every + 2}}`, "g")) || [part]).join("\n")
              : part,
          )
          .join("\n");
      })
      .join("");
  };


  const header = cols
    .slice()
    .reverse()
    .map((c, revIdx) => {
      const idx = cols.length - 1 - revIdx;
      return {
        text: rtlText(c),
        direction: "rtl",
        bold: true,
        color: COLORS.ink,
        fillColor: COLORS.header,
        alignment: "center",
        margin: isNarrow(idx) ? narrowHeadPad : headPad,
        fontSize: headSize,
      };
    });

  const body = sec.rows.length
    ? sec.rows.map((row, i) => {
        const full = [i + 1, ...row];
        const cells = full
          .map((c, idx) => ({ c, idx }))
          .reverse()
          .map(({ c, idx }) => {
            const narrow = isNarrow(idx);
            const raw = String(c ?? "");
            // Wrap long tokens so any cell can break instead of being clipped
            const text = narrow ? wrapLongToken(raw, 5) : wrapLongToken(raw, 10);
            return {
              text: rtlText(text),
              direction: "rtl",
              alignment: "center",
              margin: narrow ? narrowCellPad : cellPad,
              fontSize: narrow ? narrowCellSize : cellSize,
              color: COLORS.ink,
              noWrap: false,
            };
          });
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
          hLineWidth: () => 1,
          vLineWidth: () => 1,
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
    userRole: opts.meta?.userRole || "المستخدم",
  };
  // Use Latin digits (ar-EG-u-nu-latn) — the embedded Cairo TTF subset
  // doesn't include Arabic-Indic digit glyphs, so ٠-٩ would render as tofu.
  const dateStr = new Date().toLocaleString("ar-EG-u-nu-latn", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  // Always portrait; compact layout when many columns to fit all in width.
  const maxCols = opts.sections.reduce((m, s) => Math.max(m, s.cols.length + 1), 0);
  const dense = maxCols >= 7;
  const lineWidth = 567;

  const content: any[] = [
    headerBlock(opts.title, meta, dateStr),
    {
      canvas: [
        {
          type: "line",
          x1: 0,
          y1: 0,
          x2: lineWidth,
          y2: 0,
          lineWidth: 1.2,
          lineColor: COLORS.brand,
        },
      ],
      margin: [0, 0, 0, 10],
    },
  ];
  const sum = summaryBlock(opts.summary);
  if (sum) content.push(sum);
  for (const sec of opts.sections) content.push(tableSection(sec, dense));

  const doc: TDocumentDefinitions = {
    pageSize: "A4",
    pageOrientation: "portrait",
    pageMargins: dense ? [6, 20, 6, 28] : [14, 24, 14, 32],
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
