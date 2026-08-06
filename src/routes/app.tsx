import { createFileRoute, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/app-shell";
import { Wifi, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRequestNotifications } from "@/hooks/use-request-notifications";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, loading, profile, role, signOut, profileError, refresh, isSuperadmin } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  useRequestNotifications();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  // مدير التطبيق: يُحصر داخل صفحة الإدارة العامة فقط
  useEffect(() => {
    if (!loading && user && isSuperadmin && loc.pathname !== "/app/superadmin") {
      navigate({ to: "/app/superadmin", replace: true });
    }
  }, [loading, user, isSuperadmin, loc.pathname, navigate]);


  // حساب المستخدم: يُحصر في المتجر وصفحة التغذية والإعدادات
  useEffect(() => {
    const allowed = ["/app/store", "/app/my-orders", "/app/settings"];
    if (!loading && user && role === "user" && !allowed.includes(loc.pathname)) {
      navigate({ to: "/app/store", replace: true });
    }
  }, [loading, user, role, loc.pathname, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="rounded-3xl gradient-primary-bg p-5 shadow-glow animate-pulse">
          <Wifi className="h-10 w-10" />
        </div>
      </div>
    );
  }

  // Signed in but the profile/role could not be fetched (flaky network, RLS).
  // Show an explicit retry instead of an app shell with empty data everywhere.
  if (!profile || !role) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background px-4" dir="rtl">
        <div className="max-w-md text-center card-elegant p-8 fade-in">
          <div className="mx-auto rounded-2xl bg-warning/15 p-3 w-fit mb-4">
            <ShieldAlert className="h-8 w-8 text-warning" />
          </div>
          <h2 className="text-xl font-bold mb-2">تعذر تحميل بيانات الحساب</h2>
          <p className="text-sm text-muted-foreground mb-6">
            {profileError || "تحقّق من الاتصال بالإنترنت ثم أعد المحاولة."}
          </p>
          <div className="flex gap-2 justify-center">
            <Button className="rounded-xl" onClick={() => void refresh().catch(() => {})}>
              إعادة المحاولة
            </Button>

            <Button variant="outline" className="rounded-xl" onClick={signOut}>
              تسجيل الخروج
            </Button>
          </div>
        </div>
      </div>
    );
  }


  // Inactive account gate (agent = network admin approval, admin = app admin approval)
  if ((role === "agent" || role === "admin") && profile && !profile.is_active) {
    const isAdmin = role === "admin";
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background px-4" dir="rtl">
        <div className="max-w-md text-center card-elegant p-8 fade-in">
          <div className="mx-auto rounded-2xl bg-warning/15 p-3 w-fit mb-4">
            <ShieldAlert className="h-8 w-8 text-warning" />
          </div>
          <h2 className="text-xl font-bold mb-2">
            {isAdmin ? "بانتظار الموافقة من إدارة التطبيق" : "في انتظار التفعيل"}
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            {isAdmin
              ? "تم إنشاء حساب مدير الشبكة بنجاح، وهو الآن قيد المراجعة. سيتم تفعيل الحساب والشبكة بعد موافقة إدارة التطبيق."
              : "حسابك قيد المراجعة. يرجى التواصل مع مدير النظام لتفعيله قبل البدء بالبيع."}
          </p>
          <Button
            className="rounded-xl mb-2 w-full"
            onClick={() => void refresh().catch(() => {})}
          >
            تحديث الحالة
          </Button>
          <Button variant="outline" className="rounded-xl w-full" onClick={signOut}>
            تسجيل الخروج
          </Button>
        </div>
      </div>
    );
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
