import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, usernameToEmail } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { Eye, EyeOff, ChevronLeft, User as UserIcon } from "lucide-react";
import logo from "@/assets/wifi-store-logo.png";

export const Route = createFileRoute("/auth")({ component: AuthPage });

const APP_NAME = "كرتي";
const phoneSchema = z.string().trim().min(6, "رقم الهاتف غير صحيح").max(20).regex(/^[0-9+\-\s]+$/, "أرقام فقط");
const passwordSchema = z.string().min(6, "6 أحرف على الأقل").max(72);

type AccountType = "agent" | "network";

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [accountType, setAccountType] = useState<AccountType>("agent");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [showPwd2, setShowPwd2] = useState(false);
  const [networks, setNetworks] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => { if (!loading && user) navigate({ to: "/app" }); }, [loading, user, navigate]);

  useEffect(() => {
    if (mode === "register" && accountType === "agent") {
      (supabase.rpc as any)("list_active_networks").then(({ data }: any) => {
        setNetworks((data as { id: string; name: string }[]) ?? []);
      });
    }
  }, [mode, accountType]);

  // login
  const [loginPhone, setLoginPhone] = useState("");
  const [loginP, setLoginP] = useState("");
  // register
  const [regName, setRegName] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regNet, setRegNet] = useState("");
  const [regP, setRegP] = useState("");
  const [regP2, setRegP2] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const identifier = loginPhone.trim();
    const p = passwordSchema.safeParse(loginP);
    if (!identifier) return toast.error("أدخل رقم الجوال");
    if (!p.success) return toast.error(p.error.issues[0].message);
    setBusy(true);
    const { data: username, error: rpcErr } = await (supabase.rpc as any)("username_from_phone", { _phone: identifier });
    const loginName = (username as string | null) ?? (/^[a-zA-Z0-9._-]{3,30}$/.test(identifier) ? identifier : null);
    if (rpcErr || !loginName) { setBusy(false); return toast.error("رقم الجوال غير مسجّل"); }
    const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(loginName), password: p.data });
    setBusy(false);
    if (error) return toast.error("رقم الجوال أو كلمة المرور غير صحيحة");
    toast.success("تم تسجيل الدخول");
    navigate({ to: "/app" });
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    const ph = phoneSchema.safeParse(regPhone);
    const p = passwordSchema.safeParse(regP);
    if (!regName.trim()) return toast.error("أدخل الاسم الرباعي");
    if (!ph.success) return toast.error(ph.error.issues[0].message);
    if (accountType === "network" && !regNet.trim()) return toast.error("أدخل اسم الشبكة");
    if (!p.success) return toast.error(p.error.issues[0].message);
    if (regP !== regP2) return toast.error("كلمة المرور غير متطابقة");
    // username derived from phone (backend-safe)
    const username = `u${ph.data.replace(/\D/g, "")}`.slice(0, 30);
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: usernameToEmail(username), password: p.data,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { username, full_name: regName.trim(), phone: ph.data, account_type: accountType, network_name: regNet.trim() || null },
      },
    });
    setBusy(false);
    if (error) {
      if (error.message.toLowerCase().includes("registered")) return toast.error("رقم الجوال مستخدم من قبل");
      return toast.error(error.message);
    }
    toast.success("تم إنشاء الحساب! سيتم تفعيله من قبل المدير قبل البدء.");
    setMode("login"); setLoginPhone(ph.data); setLoginP("");
  }

  const typeLabel = accountType === "agent" ? "مندوب توزيع" : "وكيل / مدير شبكة";

  return (
    <div
      dir="rtl"
      className="min-h-dvh bg-gradient-to-b from-[#eaf7ef] to-[#d7f0e2] flex flex-col overflow-x-hidden"
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)",
      }}
    >
      <div className="flex-1 flex items-start justify-center px-4 py-4">
        <div className="w-full max-w-md">
        {mode === "login" ? (
          <div className="bg-white rounded-[28px] shadow-[0_10px_40px_-12px_rgba(16,24,40,0.15)] p-6 sm:p-7">
            <BrandHeader subtitle="قم بتسجيل الدخول" />

            <form onSubmit={handleLogin} className="space-y-3.5 mt-2">
              <SoftInput dir="rtl" value={loginPhone} onChange={(e) => setLoginPhone(e.target.value)} placeholder="رقم الجوال" inputMode="tel" autoComplete="tel" />
              <div className="relative">
                <SoftInput dir="rtl" type={showPwd ? "text" : "password"} value={loginP} onChange={(e) => setLoginP(e.target.value)} placeholder="كلمة المرور" autoComplete="current-password" className="pl-11" />
                <button type="button" onClick={() => setShowPwd((v) => !v)} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                  {showPwd ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>

              <div className="text-left -mt-1">
                <button type="button" className="text-teal-700 text-sm font-medium hover:underline">هل نسيت كلمة المرور؟</button>
              </div>

              <Button
                type="submit"
                disabled={busy}
                className="w-full h-14 rounded-2xl bg-[#22a06b] hover:bg-[#1c8a5b] active:scale-[0.99] text-white text-lg font-bold shadow-[0_8px_20px_-8px_rgba(34,160,107,0.6)] transition"
              >
                {busy ? "…" : "تسجيل الدخول"}
              </Button>
            </form>

            <p className="mt-5 text-center text-sm text-gray-700">
              لا تملك حساب؟{" "}
              <button onClick={() => setSheetOpen(true)} className="text-teal-700 font-semibold underline underline-offset-4">
                إنشاء حساب
              </button>
            </p>

            <div className="mt-6 pt-5 border-t border-gray-100">
              <p className="text-center text-sm text-gray-700 mb-3">
                بحاجة لمساعدة؟
                <br />
                <span className="text-gray-500">تواصل مع خدمة العملاء</span>
              </p>
              <div className="flex items-center justify-center gap-3">
                <SocialBtn href="https://wa.me/967778492884" label="واتساب" color="#25D366">
                  <WhatsAppIcon />
                </SocialBtn>
                <SocialBtn href="https://www.tiktok.com/@mufeed_saleh_ali_alzree?_r=1&_t=ZS-98C0Jv2XQOa" label="تيك توك" color="#111111">
                  <TikTokIcon />
                </SocialBtn>
                <SocialBtn href="https://www.facebook.com/share/1BanCjCw8T/" label="فيسبوك" color="#1877F2">
                  <FacebookIcon />
                </SocialBtn>
              </div>

              <p className="mt-5 text-center text-[13px] leading-relaxed text-gray-600">
                جميع الحقوق محفوظة © • برمجة وتصميم 💚{" "}
                <span className="text-[#22a06b] font-bold">مفيد الزري</span>
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-[28px] shadow-[0_4px_24px_-8px_rgba(0,0,0,0.08)] p-6 pb-8">
            <BrandHeader subtitle="أنشئ حسابك وابدأ إدارة أعمالك فوراً." />

            <div className="flex items-start justify-between gap-3 mb-1">
              <button onClick={() => setSheetOpen(true)} className="text-teal-700 font-semibold text-sm hover:underline shrink-0 mt-1">تغيير النوع</button>
              <h2 className="text-2xl font-bold leading-tight text-right">إنشاء حساب {typeLabel}</h2>
            </div>
            <p className="text-gray-600 text-sm text-right mb-5">
              {accountType === "network" ? "أدخل بياناتك واسم شبكتك للبدء." : "أدخل بياناتك للبدء."}
            </p>

            <form onSubmit={handleRegister} className="space-y-3">
              <SoftInput dir="rtl" value={regName} onChange={(e) => setRegName(e.target.value)} placeholder="الاسم الرباعي" autoComplete="name" />
              <SoftInput dir="rtl" value={regPhone} onChange={(e) => setRegPhone(e.target.value)} placeholder="رقم الجوال" inputMode="tel" autoComplete="tel" />
              {accountType === "network" ? (
                <SoftInput dir="rtl" value={regNet} onChange={(e) => setRegNet(e.target.value)} placeholder="اسم شبكتك" />
              ) : (
                <select
                  dir="rtl"
                  value={regNet}
                  onChange={(e) => setRegNet(e.target.value)}
                  className="w-full h-14 rounded-2xl bg-gray-100 border-0 text-right text-base placeholder:text-gray-500 focus-visible:ring-2 focus-visible:ring-teal-600 px-4"
                >
                  <option value="">اختر الشبكة التي تتبع لها</option>
                  {networks.map((n) => (
                    <option key={n.id} value={n.name}>{n.name}</option>
                  ))}
                </select>
              )}
              <div className="relative">
                <SoftInput dir="rtl" type={showPwd ? "text" : "password"} value={regP} onChange={(e) => setRegP(e.target.value)} placeholder="كلمة المرور" autoComplete="new-password" className="pl-11" />
                <button type="button" onClick={() => setShowPwd((v) => !v)} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                  {showPwd ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              <div className="relative">
                <SoftInput dir="rtl" type={showPwd2 ? "text" : "password"} value={regP2} onChange={(e) => setRegP2(e.target.value)} placeholder="تأكيد كلمة المرور" autoComplete="new-password" className="pl-11" />
                <button type="button" onClick={() => setShowPwd2((v) => !v)} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                  {showPwd2 ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>

              <Button type="submit" disabled={busy} className="w-full h-14 rounded-2xl bg-[#22a06b] hover:bg-[#1c8a5b] text-white text-lg font-bold shadow-none mt-2">
                {busy ? "…" : "إنشاء الحساب"}
              </Button>
            </form>

            <p className="mt-5 text-center text-sm text-gray-700">
              لديك حساب بالفعل ؟{" "}
              <button onClick={() => setMode("login")} className="text-teal-700 font-semibold underline underline-offset-4">
                اضغط هنا لتسجيل الدخول
              </button>
            </p>
          </div>
        )}
        </div>
      </div>



      {/* Account type bottom sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-[28px] p-6 max-w-md mx-auto" dir="rtl">
          <SheetHeader className="mb-4">
            <SheetTitle className="text-center text-2xl font-bold">اختر نوع الحساب</SheetTitle>
          </SheetHeader>
          <div className="space-y-3">
            <TypeRow
              icon={<UserIcon className="h-6 w-6 text-white" />}
              iconBg="bg-teal-700"
              title="مندوب توزيع"
              desc="بيع الكروت والتوزيع الميداني"
              onClick={() => { setAccountType("agent"); setMode("register"); setSheetOpen(false); }}
            />
            <TypeRow
              icon={<UserIcon className="h-6 w-6 text-white" />}
              iconBg="bg-[#22a06b]"
              title="وكيل / مدير شبكة"
              desc="إدارة الشبكة ومتابعة مبيعات المناديب"
              onClick={() => { setAccountType("network"); setMode("register"); setSheetOpen(false); }}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function BrandHeader({ subtitle }: { subtitle: string }) {
  return (
    <div className="flex flex-col items-center text-center mb-5">
      <img src={logo} alt={APP_NAME} width={96} height={96} className="h-20 w-20 object-contain" />
      <h1 className="text-3xl font-extrabold tracking-tight mt-1 text-gray-900">{APP_NAME}</h1>
      <p className="text-gray-600 mt-2 text-base">{subtitle}</p>
    </div>
  );
}

function TypeCard({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-2 rounded-2xl p-4 h-32 transition ${
        active
          ? "bg-teal-50 border-2 border-teal-600 shadow-[0_0_0_4px_rgba(13,148,136,0.08)]"
          : "bg-gray-100 border-2 border-transparent"
      }`}
    >
      <div className={`h-12 w-12 rounded-full flex items-center justify-center ${active ? "bg-teal-700 text-white" : "bg-gray-300 text-gray-500"}`}>
        {icon}
      </div>
      <div className={`text-sm font-bold leading-tight ${active ? "text-gray-900" : "text-gray-600"}`}>{label}</div>
    </button>
  );
}

function SoftInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return (
    <Input
      {...rest}
      className={`h-14 rounded-2xl bg-gray-100 border-0 text-right text-base placeholder:text-gray-500 focus-visible:ring-2 focus-visible:ring-teal-600 ${className}`}
    />
  );
}

function SocialBtn({ href, label, color, children }: { href: string; label: string; color: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className="h-12 w-12 rounded-full bg-white border border-gray-200 shadow-sm text-gray-800 flex items-center justify-center transition-transform hover:scale-105 hover:shadow-md active:scale-95"
      style={{ color }}
    >
      {children}
    </a>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
      <path d="M20.52 3.48A11.86 11.86 0 0 0 12.06 0C5.5 0 .17 5.33.17 11.9c0 2.1.55 4.15 1.6 5.96L0 24l6.32-1.66a11.9 11.9 0 0 0 5.73 1.46h.01c6.56 0 11.9-5.33 11.9-11.9 0-3.18-1.24-6.17-3.44-8.42ZM12.06 21.5h-.01a9.6 9.6 0 0 1-4.9-1.34l-.35-.21-3.75.98 1-3.65-.23-.37a9.58 9.58 0 0 1-1.47-5.11c0-5.3 4.32-9.62 9.62-9.62 2.57 0 4.98 1 6.8 2.82a9.55 9.55 0 0 1 2.82 6.81c0 5.3-4.32 9.63-9.53 9.69Zm5.28-7.2c-.29-.14-1.71-.85-1.98-.94-.27-.1-.46-.14-.66.14-.19.29-.76.94-.93 1.14-.17.19-.34.22-.63.07-.29-.14-1.22-.45-2.33-1.44-.86-.77-1.44-1.72-1.61-2.01-.17-.29-.02-.45.13-.6.13-.13.29-.34.44-.51.14-.17.19-.29.29-.48.1-.19.05-.36-.02-.51-.07-.14-.66-1.59-.9-2.18-.24-.57-.48-.49-.66-.5H8.9c-.19 0-.5.07-.76.36-.26.29-1 .98-1 2.39s1.02 2.77 1.17 2.96c.14.19 2 3.05 4.86 4.28.68.29 1.21.47 1.62.6.68.22 1.3.19 1.79.11.55-.08 1.71-.7 1.95-1.37.24-.67.24-1.24.17-1.37-.07-.13-.26-.2-.55-.34Z"/>
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
      <path d="M19.6 6.32a5.9 5.9 0 0 1-3.44-1.1 5.87 5.87 0 0 1-2.31-3.72h-3.2v13.14a2.66 2.66 0 1 1-1.87-2.54v-3.3a5.94 5.94 0 1 0 5.07 5.88V9.34a9.06 9.06 0 0 0 5.75 2.03V8.16c0-.63-.01-1.24 0-1.84Z"/>
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
      <path d="M22.68 0H1.32C.59 0 0 .58 0 1.31v21.38C0 23.42.59 24 1.32 24h11.5v-9.29H9.69V11.1h3.13V8.41c0-3.1 1.89-4.79 4.66-4.79 1.32 0 2.46.1 2.79.14v3.24h-1.92c-1.5 0-1.8.72-1.8 1.76v2.31h3.59l-.47 3.62h-3.12V24h6.13c.73 0 1.32-.58 1.32-1.31V1.31C24 .58 23.41 0 22.68 0Z"/>
    </svg>
  );
}


function TypeRow({ icon, iconBg, title, desc, onClick }: { icon: React.ReactNode; iconBg: string; title: string; desc: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center gap-4 p-3 rounded-2xl hover:bg-gray-50 text-right">
      <ChevronLeft className="h-5 w-5 text-gray-400 shrink-0" />
      <div className="flex-1">
        <div className="text-xl font-bold text-gray-900">{title}</div>
        <div className="text-sm text-gray-600 mt-0.5">{desc}</div>
      </div>
      <div className={`h-14 w-14 rounded-full ${iconBg} flex items-center justify-center shrink-0`}>{icon}</div>
    </button>
  );
}
