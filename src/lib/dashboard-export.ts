// dashboard-export.ts
import ExcelJS from "exceljs";
import { cleanPhoneLike } from "@/lib/format";

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
          const { data: r } = await supabase.from("user_roles").select("role").eq("user_id", u.id).maybeSingle();
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
    alert("حدث خطأ غير متوقع أثناء طباعة التقرير: " + String((err as any)?.message || err).slice(0, 120));
  }
}

