import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, FileText, Check, AlertTriangle } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/app/cards")({ component: CardsPage });

function CardsPage() {
  const { role } = useAuth();
  if (role && role !== "admin") return <Navigate to="/app" />;

  const { data: networks } = useQuery({
    queryKey: ["networks-all"],
    queryFn: async () => (await supabase.from("networks").select("id, name").order("name")).data ?? [],
  });
  const [networkId, setNetworkId] = useState<string>("");
  const [packageId, setPackageId] = useState<string>("");
  const [mode, setMode] = useState<"user_only" | "user_pass">("user_pass");
  const [rawText, setRawText] = useState("");

  const { data: packages } = useQuery({
    queryKey: ["pkgs-of", networkId],
    queryFn: async () => (await supabase.from("packages").select("id, name").eq("network_id", networkId).order("name")).data ?? [],
    enabled: !!networkId,
  });

  const parsed = useMemo(() => {
    const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const entries: { username: string; password?: string }[] = [];
    const errors: string[] = [];
    for (const line of lines) {
      if (mode === "user_only") {
        entries.push({ username: line });
      } else {
        // try JSON first if line looks like one
        if (line.startsWith("{")) {
          try {
            const o = JSON.parse(line);
            if (o.username) { entries.push({ username: String(o.username), password: o.password ? String(o.password) : undefined }); continue; }
          } catch { /* ignore */ }
        }
        const sep = line.includes("|") ? "|" : line.includes(",") ? "," : line.includes("\t") ? "\t" : " ";
        const [u, ...rest] = line.split(sep);
        const p = rest.join(sep).trim();
        if (!u) { errors.push(line); continue; }
        entries.push({ username: u.trim(), password: p || undefined });
      }
    }
    return { entries, errors, total: lines.length };
  }, [rawText, mode]);

  const upload = useMutation({
    mutationFn: async () => {
      if (!packageId) throw new Error("اختر الباقة");
      if (parsed.entries.length === 0) throw new Error("لا توجد بيانات صالحة");
      const { data, error } = await supabase.rpc("bulk_upload_cards", {
        _package_id: packageId,
        _entries: parsed.entries,
      });
      if (error) throw error;
      return Array.isArray(data) ? data[0] : data;
    },
    onSuccess: (r: any) => {
      const parts: string[] = [];
      if (r.inserted > 0) parts.push(`تم إضافة ${r.inserted} كرت`);
      if (r.duplicates > 0) parts.push(`تخطي ${r.duplicates} مكرر`);
      if (r.errors > 0) parts.push(`${r.errors} خطأ`);
      const msg = parts.length ? parts.join(" — ") : "لم تتم إضافة أي كرت";
      if (r.inserted > 0) toast.success(msg);
      else if (r.duplicates > 0 && r.errors === 0) toast.info(`جميع الكروت موجودة مسبقاً — تم تخطي ${r.duplicates} مكرر`);
      else toast.warning(msg);
      setRawText("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function extractPdfCards(f: File): Promise<string> {
    const pdfjs: any = await import("pdfjs-dist");
    const workerMod: any = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default;

    const buf = await f.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: buf }).promise;
    let allText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      allText += content.items.map((it: any) => it.str).join(" ") + "\n";
    }

    // Collect all numeric tokens, preserving order.
    const tokens = allText.match(/\d{3,20}/g) ?? [];
    const usernames: string[] = [];
    const passwords: string[] = [];
    for (const t of tokens) {
      if (t.length >= 8) usernames.push(t);
      else passwords.push(t);
    }

    // Deduplicate usernames while keeping order.
    const seen = new Set<string>();
    const uniqueUsers = usernames.filter((u) => (seen.has(u) ? false : (seen.add(u), true)));

    if (mode === "user_only") {
      return uniqueUsers.join("\n");
    }

    // Strategy A: inline pairs — long digits directly followed (within 1-20 non-digits) by short digits.
    const inlineRe = /(\d{8,20})\D{1,20}?(\d{3,7})(?!\d)/g;
    const inlinePairs = new Map<string, string>();
    let m: RegExpExecArray | null;
    while ((m = inlineRe.exec(allText)) !== null) {
      if (!inlinePairs.has(m[1])) inlinePairs.set(m[1], m[2]);
    }

    // If we have a password for most usernames inline, use that.
    if (inlinePairs.size >= Math.floor(uniqueUsers.length * 0.6)) {
      return uniqueUsers
        .map((u) => (inlinePairs.has(u) ? `${u}|${inlinePairs.get(u)}` : u))
        .join("\n");
    }

    // Strategy B: two-column layout — all usernames listed, then all passwords listed.
    // Pair by order when counts match.
    if (passwords.length >= uniqueUsers.length) {
      return uniqueUsers.map((u, i) => `${u}|${passwords[i]}`).join("\n");
    }

    // Fallback: usernames only.
    return uniqueUsers.join("\n");
  }

  async function handleFile(f: File) {
    const name = f.name.toLowerCase();
    if (name.endsWith(".pdf")) {
      try {
        const parsed = await extractPdfCards(f);
        if (!parsed) throw new Error("no cards");
        setRawText(parsed);
        toast.success(`تم استخراج ${parsed.split("\n").length} كرت من الملف`);
      } catch (e) {
        toast.error("تعذّر قراءة ملف PDF");
      }
      return;
    }
    const text = await f.text();
    if (name.endsWith(".json")) {
      try {
        const arr = JSON.parse(text);
        if (Array.isArray(arr)) {
          setRawText(arr.map((x) => typeof x === "string" ? x : `${x.username}${x.password ? "|" + x.password : ""}`).join("\n"));
          return;
        }
      } catch {/**/}
    }
    setRawText(text);
  }


  return (
    <>
      <PageHeader title="رفع الكروت" description="أضف الكروت بالجملة إلى الباقات" />
      <Card className="card-elegant border-0 p-5 max-w-3xl">
        <div className="grid md:grid-cols-2 gap-3 mb-4">
          <div>
            <Label className="text-xs mb-1.5 block">الشبكة</Label>
            <Select value={networkId} onValueChange={(v) => { setNetworkId(v); setPackageId(""); }}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="اختر الشبكة" /></SelectTrigger>
              <SelectContent>{networks?.map((n) => <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs mb-1.5 block">الباقة</Label>
            <Select value={packageId} onValueChange={setPackageId} disabled={!networkId}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="اختر الباقة" /></SelectTrigger>
              <SelectContent>{packages?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        <Tabs value={mode} onValueChange={(v) => setMode(v as any)} className="mb-4">
          <TabsList className="rounded-xl">
            <TabsTrigger value="user_pass" className="rounded-lg">مستخدم | كلمة مرور</TabsTrigger>
            <TabsTrigger value="user_only" className="rounded-lg">مستخدم فقط</TabsTrigger>
          </TabsList>
          <TabsContent value="user_pass" className="text-xs text-muted-foreground mt-2">
            كل سطر: <code className="bg-muted px-1.5 py-0.5 rounded">3852557443|1234</code> — يدعم أيضًا الفواصل: <code>,</code> أو <code>tab</code>.
          </TabsContent>
          <TabsContent value="user_only" className="text-xs text-muted-foreground mt-2">
            كل سطر يمثل اسم مستخدم فقط.
          </TabsContent>
        </Tabs>

        <div className="mb-3">
          <Label className="text-xs mb-1.5 block">لصق أو تحميل ملف (TXT / CSV / JSON)</Label>
          <Textarea rows={10} className="font-mono text-sm rounded-xl" value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="3852557443|1234&#10;4312532609|5678" />
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <label className="cursor-pointer">
            <input type="file" accept=".txt,.csv,.json,.pdf" className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary/10 px-3 py-1.5 rounded-lg">
              <FileText className="h-3.5 w-3.5" /> تحميل ملف
            </span>
          </label>
          {parsed.total > 0 && (
            <div className="flex gap-3 text-xs">
              <Badge tone="success"><Check className="h-3 w-3" /> {parsed.entries.length} صالح</Badge>
              {parsed.errors.length > 0 && <Badge tone="warning"><AlertTriangle className="h-3 w-3" /> {parsed.errors.length} خطأ</Badge>}
            </div>
          )}
        </div>

        <Button onClick={() => upload.mutate()} disabled={upload.isPending || !packageId || parsed.entries.length === 0}
          className="w-full h-11 rounded-xl gradient-primary-bg border-0 font-semibold">
          <Upload className="h-4 w-4 ml-1" />
          {upload.isPending ? "جارٍ الرفع..." : `رفع ${parsed.entries.length} كرت`}
        </Button>
      </Card>
    </>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "success" | "warning" }) {
  const c = tone === "success" ? "bg-success/15 text-success" : "bg-warning/15 text-warning";
  return <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-semibold ${c}`}>{children}</span>;
}
