// dashboard-export.ts
import writeXlsxFile from "write-excel-file/browser";
import { cleanPhoneLike } from "@/lib/format";

export type SummaryRow = { label: string; value: string | number };
export type TableSection = { title: string; cols: string[]; rows: (string | number)[][] };

type Cell = { value: string | number | null; type?: any; fontWeight?: "bold" };

function toCell(v: string | number | null | undefined): Cell {
  if (v === null || v === undefined || v === "") return { value: null };
  if (typeof v === "number" && Number.isFinite(v)) return { type: Number, value: v };
  return { type: String, value: String(v) };
}

export async function exportToExcel(
  fileName: string,
  summary: SummaryRow[],
  sections: TableSection[],
) {
  try {
    const sheets: Cell[][][] = [];
    const sheetNames: string[] = [];

    // Summary sheet
    const sumData: Cell[][] = [
      [
        { value: "البند", type: String, fontWeight: "bold" },
        { value: "القيمة", type: String, fontWeight: "bold" },
      ],
      ...summary.map((s) => [toCell(s.label), toCell(s.value)]),
    ];
    sheets.push(sumData);
    sheetNames.push("الملخص");

    sections.forEach((sec, i) => {
      const name = (sec.title || `ورقة ${i + 1}`).slice(0, 30).replace(/[\\/*?:[\]]/g, " ");
      const header: Cell[] = sec.cols.map((c) => ({ value: c, type: String, fontWeight: "bold" }));
      const body: Cell[][] = sec.rows.map((row) => row.map((v) => toCell(v)));
      sheets.push([header, ...body]);
      sheetNames.push(name);
    });

    await writeXlsxFile(
      sheets as any,
      {
        sheets: sheetNames,
        fileName: `${fileName}.xlsx`,
        rightToLeft: true,
      } as any,
    );
  } catch (err) {
    console.error("[exportToExcel] failed:", err);
    alert("فشل تصدير ملف Excel، يرجى المحاولة مجدداً");
  }
}

export type ReportMeta = {
  reportName?: string;
  branch?: string;
  user?: string;
  userRole?: string;
  systemName?: string;
};

export async function exportToPDF(
  title: string,
  summary: SummaryRow[],
  sections: TableSection[],
  meta: ReportMeta = {},
) {
  try {
    // Auto-fill user from Supabase session if not provided
    let userName = meta.user ?? "";
    let userRole = meta.userRole ?? "";
    if (!userName || !userRole) {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data } = await supabase.auth.getUser();
        const u = data?.user;
        if (!userName) {
          userName =
            (u?.user_metadata as any)?.full_name ||
            cleanPhoneLike((u?.user_metadata as any)?.username) ||
            cleanPhoneLike(u?.phone) ||
            u?.email ||
            "—";
        }
        if (!userRole && u?.id) {
          const { data: r } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", u.id)
            .maybeSingle();
          const role = (r as any)?.role;
          userRole = role === "admin" ? "المدير" : role === "agent" ? "المندوب" : "المستخدم";
        }
      } catch {
        if (!userName) userName = "—";
      }
    }
    if (!userRole) userRole = "المستخدم";

    const [{ buildReportPdfBlob }, { sharePdfBlob }] = await Promise.all([
      import("./pdfmake-report"),
      import("./native-pdf"),
    ]);

    const blob = await buildReportPdfBlob({
      title,
      summary,
      sections,
      meta: {
        systemName: meta.systemName || "كرتي — نظام إدارة الشبكات والمناديب",
        reportName: meta.reportName || title,
        branch: meta.branch || "—",
        user: userName,
        userRole,
      },
    });

    await sharePdfBlob({
      blob,
      filename: title,
      dialogTitle: "مشاركة أو طباعة التقرير",
    });
  } catch (err) {
    console.error("[exportToPDF] failed:", err);
    alert(
      "حدث خطأ غير متوقع أثناء طباعة التقرير: " +
        String((err as any)?.message || err).slice(0, 120),
    );
  }
}
