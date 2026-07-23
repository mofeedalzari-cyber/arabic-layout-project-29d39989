// ============================================================
//  AdminBreakdowns - بعد التعديل
// ============================================================

function AdminBreakdowns() {
  const { data: networks } = useQuery({
    queryKey: ["dash-networks"],
    queryFn: async () => (await supabase.from("networks").select("id, name, currency")).data ?? [],
  });
  const { data: packages } = useQuery({
    queryKey: ["dash-packages"],
    queryFn: async () => (await supabase.from("packages").select("id, name, price, network_id")).data ?? [],
  });
  const { data: cards } = useQuery({
    queryKey: ["dash-cards"],
    queryFn: async () => (await supabase.from("cards").select("id, status, package_id, network_id, assigned_to")).data ?? [],
  });
  const { data: sales } = useQuery({
    queryKey: ["dash-sales-all"],
    queryFn: async () => (await supabase.from("sales").select("agent_id, agent_username, package_id, network_id, price")).data ?? [],
  });
  const { data: paymentsCollected } = useQuery({
    queryKey: ["dash-payments-collected"],
    queryFn: async () => {
      const { data } = await supabase.from("card_requests").select("paid_amount").eq("status", "APPROVED");
      return (data ?? []).reduce((s, r: any) => s + Number(r.paid_amount || 0), 0);
    },
  });
  const { data: agents } = useQuery({
    queryKey: ["dash-agents"],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "agent");
      const ids = roles?.map((r) => r.user_id) ?? [];
      if (!ids.length) return [];
      const { data } = await supabase.from("profiles").select("id, username, full_name, phone, is_active").in("id", ids).order("full_name");
      return data ?? [];
    },
  });

  const netMap = useMemo(() => new Map(networks?.map((n) => [n.id, n]) ?? []), [networks]);
  const pkgMap = useMemo(() => new Map(packages?.map((p) => [p.id, p]) ?? []), [packages]);
  const agentMap = useMemo(() => new Map(agents?.map((a) => [a.id, a]) ?? []), [agents]);

  const salesByPkg = useMemo(() => {
    const m = new Map<string, { network: string; pkg: string; total: number; sold: number; withdrawn: number; remaining: number; value: number; currency?: string }>();
    (packages ?? []).forEach((p) => {
      const net = netMap.get(p.network_id);
      m.set(p.id, { network: net?.name ?? "—", pkg: p.name, total: 0, sold: 0, withdrawn: 0, remaining: 0, value: 0, currency: net?.currency });
    });
    (cards ?? []).forEach((c) => {
      const row = m.get(c.package_id);
      if (!row) return;
      row.total++;
      if (c.status === "SOLD") row.sold++;
      else if (c.status === "ASSIGNED") row.withdrawn++;
      else if (c.status === "AVAILABLE") row.remaining++;
    });
    (sales ?? []).forEach((s) => {
      const row = m.get(s.package_id);
      if (row) row.value += Number(s.price || 0);
    });
    return Array.from(m.values()).sort((a, b) => b.sold - a.sold);
  }, [packages, cards, sales, netMap]);

  const summary = useMemo(() => {
    const list = cards ?? [];
    const total = list.length;
    const sold = list.filter((c) => c.status === "SOLD").length;
    const remaining = list.filter((c) => c.status === "AVAILABLE").length;
    const salesValue = (sales ?? []).reduce((s, r) => s + Number(r.price || 0), 0);
    const debts = list.reduce((s, c) => {
      if (c.status !== "ASSIGNED") return s;
      const p = pkgMap.get(c.package_id);
      return s + (p ? Number(p.price) : 0);
    }, 0);
    return { total, sold, remaining, salesValue, debts, collected: paymentsCollected ?? 0, agentsCount: agents?.length ?? 0 };
  }, [cards, sales, pkgMap, agents, paymentsCollected]);

  const agentStats = useMemo(() => {
    type Row = { agentId: string; agent: string; phone: string; pkg: string; price: number; currency?: string; holding: number };
    const m = new Map<string, Row>();
    (cards ?? []).forEach((c) => {
      if (c.status !== "ASSIGNED" || !c.assigned_to) return;
      const key = `${c.assigned_to}::${c.package_id}`;
      const pkg = pkgMap.get(c.package_id);
      const net = netMap.get(c.network_id);
      const ag = agentMap.get(c.assigned_to);
      const cur = m.get(key) ?? {
        agentId: c.assigned_to,
        agent: ag?.full_name || displayPhone((ag as any)?.phone, ag?.username),
        phone: displayPhone((ag as any)?.phone, ag?.username),
        pkg: pkg?.name ?? "—",
        price: pkg ? Number(pkg.price) : 0,
        currency: net?.currency,
        holding: 0,
      };
      cur.holding++;
      m.set(key, cur);
    });
    return Array.from(m.values()).sort((a, b) => a.agent.localeCompare(b.agent));
  }, [cards, pkgMap, netMap, agentMap]);

  // ====================== دوال التصدير (كما هي) ======================
  const buildExportData = (): { summary: SummaryRow[]; sections: TableSection[] } => {
    const sumRows: SummaryRow[] = [
      { label: "إجمالي الكروت المُضافة", value: summary.total },
      { label: "الكروت المُباعة", value: summary.sold },
      { label: "الكروت المتبقية", value: summary.remaining },
      { label: "عدد المناديب", value: summary.agentsCount },
      { label: "إجمالي قيمة المبيعات", value: fmtMoney(summary.salesValue) },
      { label: "إجمالي ديون المناديب", value: fmtMoney(summary.debts) },
      { label: "الرصيد", value: fmtMoney(summary.collected) },
    ];
    const sections: TableSection[] = [
      {
        title: "إحصائيات المبيعات حسب الفئات",
        cols: ["الشبكة", "الفئة", "إجمالي الكروت", "مباعة", "متبقية", "إجمالي القيمة"],
        rows: salesByPkg.map((r) => [
          r.network, r.pkg, r.total, r.sold, r.remaining,
          `${fmtMoney(r.value)}${r.currency ? " " + r.currency : ""}`,
        ]),
      },
      {
        title: "إحصائيات المناديب",
        cols: ["المندوب", "الهاتف", "الفئة", "لديه", "السعر"],
        rows: agentStats.map((r) => [
          r.agent, r.phone, r.pkg, r.holding,
          `${fmtMoney(r.price)}${r.currency ? " " + r.currency : ""}`,
        ]),
      },
      {
        title: "المناديب المرتبطين بالشبكة",
        cols: ["المندوب", "الهاتف", "الحالة"],
        rows: (agents ?? []).map((a) => [
          a.full_name || displayPhone((a as any).phone, a.username), displayPhone((a as any).phone, a.username), a.is_active ? "نشط" : "موقوف",
        ]),
      },
    ];
    return { summary: sumRows, sections };
  };

  const handleExcel = () => {
    const { summary: s, sections } = buildExportData();
    const stamp = new Date().toISOString().slice(0, 10);
    exportToExcel(`لوحة-التحكم-${stamp}`, s, sections);
  };
  const handlePDF = () => {
    const { summary: s, sections } = buildExportData();
    exportToPDF("لوحة التحكم — تقرير شامل", s, sections);
  };

  // ====================== مكون البطاقات القابلة للتمرير ======================
  function PackageCards({ data }: { data: typeof salesByPkg }) {
    return (
      <div
        className="w-full overflow-x-auto overflow-y-hidden scroll-snap-x-mandatory"
        style={{
          WebkitOverflowScrolling: 'touch',
          scrollSnapType: 'x mandatory',
        }}
      >
        <div
          className="flex flex-row gap-4"
          style={{ whiteSpace: 'nowrap' }}
        >
          {data.map((item) => (
            <div
              key={`${item.network}-${item.pkg}`}
              className="min-w-[280px] max-w-[320px] flex-shrink-0"
              style={{ scrollSnapAlign: 'start' }}
            >
              <Card className="p-4 border-0 shadow-sm">
                <h4 className="font-bold text-sm truncate">{item.pkg}</h4>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">المبلغ</span>
                    <div className="font-semibold text-sm">{fmtMoney(item.value)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">المتبقي</span>
                    <div className="font-semibold text-sm">{item.remaining}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">المسحوب</span>
                    <div className="font-semibold text-sm">{item.sold}</div>
                  </div>
                </div>
              </Card>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ====================== التصيير (Render) ======================
  return (
    <div className="grid gap-4 md:gap-6 w-full max-w-full">
      {/* بطاقة الملخص */}
      <Card className="card-elegant p-3 sm:p-5 border-0 w-full max-w-full">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <Activity className="h-4 w-4 text-primary shrink-0" />
            <h3 className="font-bold text-sm sm:text-base">ملخص الشبكة</h3>
          </div>
          <div className="flex flex-col sm:flex-row sm:mr-auto gap-2 w-full sm:w-auto">
            <Button size="sm" variant="outline" onClick={handleExcel} className="h-9 gap-1.5 text-xs w-full sm:w-auto">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              تصدير Excel
            </Button>
            <Button size="sm" variant="outline" onClick={handlePDF} className="h-9 gap-1.5 text-xs w-full sm:w-auto">
              <FileText className="h-3.5 w-3.5" />
              تصدير PDF
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
          <SummaryItem label="إجمالي الكروت المُضافة" value={fmtMoney(summary.total)} />
          <SummaryItem label="الكروت المُباعة" value={fmtMoney(summary.sold)} tone="success" />
          <SummaryItem label="الكروت المتبقية" value={fmtMoney(summary.remaining)} tone="warning" />
          <SummaryItem label="عدد المناديب" value={fmtMoney(summary.agentsCount)} />
          <SummaryItem label="إجمالي قيمة المبيعات" value={fmtMoney(summary.salesValue)} tone="primary" />
          <SummaryItem label="إجمالي ديون المناديب" value={fmtMoney(summary.debts)} tone="danger" />
          <SummaryItem label="الرصيد" value={fmtMoney(summary.collected)} tone="success" />
        </div>
      </Card>

      {/* قسم إحصائيات المبيعات حسب الفئات - الآن بطاقات تمرير */}
      <Card className="card-elegant p-3 sm:p-5 border-0 w-full max-w-full">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <Layers className="h-4 w-4 text-primary shrink-0" />
            <h3 className="font-bold text-sm sm:text-base">إحصائيات المبيعات حسب الفئات</h3>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="sm:mr-auto h-9 gap-1.5 text-xs w-full sm:w-auto"
            onClick={() => {
              const totalCards = salesByPkg.reduce((s, r) => s + r.total, 0);
              const totalSold = salesByPkg.reduce((s, r) => s + r.sold, 0);
              const totalRemaining = salesByPkg.reduce((s, r) => s + r.remaining, 0);
              const totalValue = salesByPkg.reduce((s, r) => s + r.value, 0);
              const rows: (string | number)[][] = salesByPkg.map((r) => [
                r.network, r.pkg, r.total, r.sold, r.remaining,
                `${fmtMoney(r.value)}${r.currency ? " " + r.currency : ""}`,
              ]);
              rows.push(["الإجمالي", "", totalCards, totalSold, totalRemaining, fmtMoney(totalValue)]);
              const stamp = new Date().toISOString().slice(0, 10);
              exportToPDF(
                `إحصائيات المبيعات حسب الفئات — ${stamp}`,
                [],
                [{
                  title: "إحصائيات المبيعات حسب الفئات",
                  cols: ["الشبكة", "الفئة", "إجمالي الكروت", "مباعة", "متبقية", "إجمالي القيمة"],
                  rows,
                }],
              );
            }}
          >
            <FileText className="h-3.5 w-3.5" />
            تصدير PDF
          </Button>
        </div>

        {/* استبدال الرسم البياني بالبطاقات */}
        <PackageCards data={salesByPkg} />
      </Card>

      {/* قسم إحصائيات المناديب (يُترك كما هو) */}
      <div className="grid md:grid-cols-2 gap-4 md:gap-6">
        <Card className="card-elegant p-3 sm:p-5 border-0 w-full max-w-full">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <UserCheck className="h-4 w-4 text-primary shrink-0" />
              <h3 className="font-bold text-sm sm:text-base">إحصائيات المناديب</h3>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="sm:mr-auto h-9 gap-1.5 text-xs w-full sm:w-auto"
              onClick={() => {
                const rows: (string | number)[][] = agentStats.map((r) => [
                  r.agent,
                  r.phone,
                  r.pkg,
                  `${fmtMoney(r.price)}${r.currency ? " " + r.currency : ""}`,
                  r.currency ?? "",
                  r.holding,
                ]);
                const sumRows: SummaryRow[] = [
                  { label: "إجمالي الكروت المُضافة", value: fmtMoney(summary.total) },
                  { label: "الكروت المُباعة", value: fmtMoney(summary.sold) },
                  { label: "الكروت المتبقية", value: fmtMoney(summary.remaining) },
                  { label: "عدد المناديب", value: fmtMoney(summary.agentsCount) },
                  { label: "إجمالي قيمة المبيعات", value: fmtMoney(summary.salesValue) },
                  { label: "إجمالي ديون المناديب", value: fmtMoney(summary.debts) },
                  { label: "الرصيد", value: fmtMoney(summary.collected) },
                ];
                const stamp = new Date().toISOString().slice(0, 10);
                exportToPDF(
                  `إحصائيات المناديب — ${stamp}`,
                  sumRows,
                  [{
                    title: "إحصائيات المناديب",
                    cols: ["المندوب", "الهاتف", "الفئة", "القيمة الاسمية", "العملة", "المسحوبة"],
                    rows,
                  }],
                );
              }}
            >
              <FileText className="h-3.5 w-3.5" />
              تصدير PDF
            </Button>
          </div>

          {/* احتفظ بالرسم البياني للمناديب */}
          <AgentsChart
            totals={{
              withdrawn: agentStats.reduce((s, r) => s + r.holding, 0),
              sold: summary.sold,
              remaining: summary.remaining,
            }}
          />

          {agentStats.length > 0 && (
            <div className="mt-3 flex justify-center">
              <Button asChild size="sm" variant="outline" className="h-9 text-xs gap-1.5">
                <Link to="/app/agents">
                  عرض التفاصيل الكاملة
                </Link>
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
