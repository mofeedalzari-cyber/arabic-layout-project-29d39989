import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bike, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, usernameToEmail } from "@/lib/auth-context";
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
  AuthFooter,
  AuthCopyright,
  BackToLogin,
} from "@/components/auth/auth-parts";

export const Route = createFileRoute("/register-network")({
  component: NetworkRegisterPage,
  head: () => ({
    meta: [
      { title: `إنشاء حساب مدير شبكة — ${APP_NAME}` },
      {
        name: "description",
        content: "إنشاء حساب مدير شبكة جديد في كرتي. يتم تفعيل الحساب بعد موافقة مدير التطبيق.",
      },
      { property: "og:title", content: `إنشاء حساب مدير شبكة — ${APP_NAME}` },
      {
        property: "og:description",
        content: "إنشاء حساب مدير شبكة جديد في كرتي.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${SITE_URL}/register-network` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/register-network` }],
  }),
});

function NetworkRegisterPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  const [busy, setBusy] = useState(false);
  const [regName, setRegName] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regNet, setRegNet] = useState("");
  const [regP, setRegP] = useState("");
  const [regP2, setRegP2] = useState("");

  useEffect(() => {
    if (!loading && user) navigate({ to: "/app" });
  }, [loading, user, navigate]);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    const ph = phoneSchema.safeParse(regPhone);
    const p = passwordSchema.safeParse(regP);
    if (!regName.trim()) return toast.error("أدخل الاسم الرباعي");
    if (!ph.success) return toast.error(ph.error.issues[0].message);
    if (!regNet.trim()) return toast.error("أدخل اسم الشبكة");
    if (!p.success) return toast.error(p.error.issues[0].message);
    if (regP !== regP2) return toast.error("كلمة المرور غير متطابقة");

    const username = `u${ph.data.replace(/\D/g, "")}`.slice(0, 30);
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: usernameToEmail(username),
      password: p.data,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: {
          username,
          full_name: regName.trim(),
          phone: ph.data,
          account_type: "network",
          network_name: regNet.trim(),
        },
      },
    });
    setBusy(false);

    if (error) {
      if (error.message.toLowerCase().includes("registered"))
        return toast.error("رقم الجوال مستخدم من قبل");
      return toast.error(error.message);
    }

    toast.success("تم إنشاء الحساب! سيتم تفعيله بعد موافقة مدير التطبيق.");
    navigate({ to: "/auth" });
  }

  return (
    <AuthShell>
      <AuthCard>
        <div className="flex-1 flex flex-col justify-center">
          <BrandHeader subtitle="إنشاء حساب مدير شبكة" />
          <h2 className="text-center text-[22px] sm:text-2xl font-bold text-gray-900 mb-1">
            إنشاء حساب جديد.
          </h2>
          <p className="text-center text-xs text-gray-500 mb-5">
            يتم تفعيل الحساب بعد موافقة مدير التطبيق.
          </p>

          <form onSubmit={handleRegister} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <TypeCard
                active={false}
                onClick={() => navigate({ to: "/register-agent" })}
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
                active
                onClick={() => {}}
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
              value={regName}
              onChange={(e) => setRegName(e.target.value)}
              placeholder="الاسم الرباعي"
              autoComplete="name"
            />
            <SoftInput
              value={regPhone}
              onChange={(e) => setRegPhone(e.target.value)}
              placeholder="رقم الجوال"
              inputMode="tel"
              autoComplete="tel"
            />
            <SoftInput
              value={regNet}
              onChange={(e) => setRegNet(e.target.value)}
              placeholder="اسم شبكتك"
            />
            <PasswordInput
              value={regP}
              onChange={setRegP}
              placeholder="كلمة المرور"
              autoComplete="new-password"
            />
            <PasswordInput
              value={regP2}
              onChange={setRegP2}
              placeholder="تأكيد كلمة المرور"
              autoComplete="new-password"
            />

            <Button
              type="submit"
              disabled={busy}
              className="w-full h-14 rounded-2xl bg-[#12a05f] hover:bg-[#0e8b52] active:scale-[0.99] text-white text-lg font-bold shadow-none transition"
            >
              {busy ? "…" : "إنشاء الحساب"}
            </Button>

            <BackToLogin />
          </form>
        </div>
        <AuthFooter />
      </AuthCard>
    </AuthShell>
  );
}
