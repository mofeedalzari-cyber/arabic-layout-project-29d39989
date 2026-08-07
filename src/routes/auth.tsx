import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, usernameToEmail } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Bike, Share2, User as UserIcon } from "lucide-react";
import {
  APP_NAME,
  SITE_URL,
  phoneSchema,
  passwordSchema,
  AuthShell,
  AuthCard,
  BrandHeader,
  SoftInput,
  PasswordInput,
  TypeCard,
  TypeRow,
  AuthFooter,
  AuthCopyright,
} from "@/components/auth/auth-parts";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — كرتي لإدارة كروت الإنترنت" },
      {
        name: "description",
        content:
          "سجّل الدخول إلى كرتي برقم الهاتف وكلمة المرور لإدارة شبكات الإنترنت والباقات والكروت ومتابعة مبيعات المناديب.",
      },
      { property: "og:title", content: "تسجيل الدخول — كرتي لإدارة كروت الإنترنت" },
      {
        property: "og:description",
        content: "دخول المديرين والمناديب إلى منصة كرتي لإدارة وبيع كروت الإنترنت.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${SITE_URL}/auth` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/auth` }],
  }),
});

type AccountType = "agent" | "network";

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  const [accountType, setAccountType] = useState<AccountType>("agent");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [loginPhone, setLoginPhone] = useState("");
  const [loginP, setLoginP] = useState("");

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotPhone, setForgotPhone] = useState("");
  const [forgotNote, setForgotNote] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/app" });
  }, [loading, user, navigate]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const identifier = loginPhone.trim();
    const p = passwordSchema.safeParse(loginP);
    if (!identifier) return toast.error("أدخل رقم الجوال");
    if (!p.success) return toast.error(p.error.issues[0].message);

    setBusy(true);
    try {
      const digits = identifier.replace(/\D/g, "");
      let loginName: string | null = null;

      if (digits) {
        const { data, error: lookupError } = await (supabase.rpc as any)(
          "username_from_phone",
          { _phone: digits },
        );
        if (lookupError) throw lookupError;
        loginName = typeof data === "string" && data ? data : null;
      } else if (/^[a-zA-Z0-9._-]{3,30}$/.test(identifier)) {
        loginName = identifier;
      }

      if (!loginName) {
        toast.error("رقم الجوال أو كلمة المرور غير صحيحة");
        return;
      }

      const { data: signIn, error } = await supabase.auth.signInWithPassword({
        email: usernameToEmail(loginName),
        password: p.data,
      });
      if (error || !signIn.user) {
        toast.error("رقم الجوال أو كلمة المرور غير صحيحة");
        return;
      }

      const { data: roles, error: rolesErr } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", signIn.user.id);
      if (rolesErr) {
        await supabase.auth.signOut({ scope: "local" });
        toast.error("تعذر التحقق من نوع الحساب، أعد المحاولة");
        return;
      }
      const has = (r: string) => !!roles?.some((x) => x.role === r);
      const allowed = has("superadmin")
        ? true
        : accountType === "agent"
          ? has("agent")
          : has("admin");
      if (!allowed) {
        await supabase.auth.signOut({ scope: "local" });
        toast.error(
          accountType === "agent"
            ? "هذا الحساب ليس حساب مندوب توزيع، اختر «وكيل / مدير شبكة»"
            : "هذا الحساب ليس حساب مدير شبكة، اختر «مندوب توزيع»",
        );
        return;
      }

      toast.success("تم تسجيل الدخول");
      navigate({ to: "/app" });
    } catch (error) {
      console.error("[auth] login failed", error);
      toast.error("تعذر تسجيل الدخول، تحقق من الاتصال ثم أعد المحاولة");
    } finally {
      setBusy(false);
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    const ph = phoneSchema.safeParse(forgotPhone);
    if (!ph.success) return toast.error(ph.error.issues[0].message);
    setForgotBusy(true);
    const { error } = await (supabase.rpc as any)("submit_password_reset_request", {
      _phone: ph.data,
      _note: forgotNote.trim() || null,
    });
    setForgotBusy(false);
    if (error) return toast.error(error.message ?? "تعذر إرسال الطلب");
    toast.success("تم إرسال طلب استعادة كلمة المرور. سيتواصل معك مدير التطبيق قريبًا.");
    setForgotOpen(false);
    setForgotPhone("");
    setForgotNote("");
  }

  return (
    <AuthShell>
      <AuthCard>
        <div className="flex-1 flex flex-col justify-center">
          <BrandHeader />

          <h2 className="text-center text-[22px] sm:text-2xl font-bold text-gray-900 mb-5">
            قم بتسجيل الدخول.
          </h2>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <TypeCard
                active={accountType === "agent"}
                onClick={() => setAccountType("agent")}
                icon={<Bike className="h-6 w-6" />}
                label={
                  <>
                    مندوب
                    <br />
                    توزيع
                  </>
                }
              />
              <TypeCard
                active={accountType === "network"}
                onClick={() => setAccountType("network")}
                icon={<Share2 className="h-6 w-6" />}
                label={
                  <>
                    وكيل / مدير
                    <br />
                    شبكة
                  </>
                }
              />
            </div>

            <SoftInput
              value={loginPhone}
              onChange={(e) => setLoginPhone(e.target.value)}
              placeholder="رقم الجوال"
              inputMode="tel"
              autoComplete="tel"
            />

            <PasswordInput
              value={loginP}
              onChange={setLoginP}
              placeholder="كلمة المرور"
              autoComplete="current-password"
            />

            <div className="text-start">
              <button
                type="button"
                onClick={() => {
                  setForgotPhone(loginPhone);
                  setForgotOpen(true);
                }}
                className="text-[#0f766e] text-sm font-bold"
              >
                هل نسيت كلمة المرور؟
              </button>
            </div>

            <Button
              type="submit"
              disabled={busy}
              className="w-full h-14 rounded-2xl bg-[#12a05f] hover:bg-[#0e8b52] active:scale-[0.99] text-white text-lg font-bold shadow-none transition"
            >
              {busy ? "…" : "تسجيل الدخول"}
            </Button>

            <p className="text-center text-sm text-gray-800">
              لا تملك حساب ؟{" "}
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                className="text-[#0f766e] font-bold underline underline-offset-4"
              >
                انقر هنا لإنشاء حساب
              </button>
            </p>
          </form>
        </div>

        <AuthFooter />
        <AuthCopyright />
      </AuthCard>

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
              onClick={() => {
                setSheetOpen(false);
                navigate({ to: "/register-agent" });
              }}
            />
            <TypeRow
              icon={<UserIcon className="h-6 w-6 text-white" />}
              iconBg="bg-[#22a06b]"
              title="وكيل / مدير شبكة"
              desc="إدارة الشبكة ومتابعة مبيعات المناديب"
              onClick={() => {
                setSheetOpen(false);
                navigate({ to: "/register-network" });
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>استعادة كلمة المرور</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleForgot} className="space-y-3">
            <p className="text-sm text-gray-600">
              أدخل رقم جوالك المسجّل وسيتواصل معك مدير التطبيق لإعادة تعيين كلمة المرور.
            </p>
            <SoftInput
              value={forgotPhone}
              onChange={(e) => setForgotPhone(e.target.value)}
              placeholder="رقم الجوال"
              inputMode="tel"
            />
            <textarea
              dir="rtl"
              value={forgotNote}
              onChange={(e) => setForgotNote(e.target.value)}
              placeholder="ملاحظة (اختياري): اسمك أو اسم شبكتك"
              rows={3}
              className="w-full rounded-2xl bg-gray-100 border-0 text-right text-base placeholder:text-gray-500 focus-visible:ring-2 focus-visible:ring-teal-600 px-4 py-3"
            />
            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={() => setForgotOpen(false)}>
                إلغاء
              </Button>
              <Button
                type="submit"
                disabled={forgotBusy}
                className="bg-[#22a06b] hover:bg-[#1c8a5b] text-white"
              >
                {forgotBusy ? "…" : "إرسال الطلب"}
              </Button>
            </DialogFooter>
          </form>
          <p className="text-xs text-gray-500 text-center">
            أو تواصل مباشرة عبر واتساب:{" "}
            <a
              href="https://wa.me/967778492884"
              target="_blank"
              rel="noreferrer"
              className="text-teal-700 font-semibold"
            >
              778492884
            </a>
          </p>
        </DialogContent>
      </Dialog>
    </AuthShell>
  );
}
