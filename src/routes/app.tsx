import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/app-shell";
import { Wifi, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, loading, profile, role, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="rounded-3xl gradient-primary-bg p-5 shadow-glow animate-pulse">
          <Wifi className="h-10 w-10" />
        </div>
      </div>
    );
  }

  // Inactive agent gate
  if (role === "agent" && profile && !profile.is_active) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background px-4" dir="rtl">
        <div className="max-w-md text-center card-elegant p-8 fade-in">
          <div className="mx-auto rounded-2xl bg-warning/15 p-3 w-fit mb-4">
            <ShieldAlert className="h-8 w-8 text-warning" />
          </div>
          <h2 className="text-xl font-bold mb-2">في انتظار التفعيل</h2>
          <p className="text-sm text-muted-foreground mb-6">
            حسابك قيد المراجعة. يرجى التواصل مع مدير النظام لتفعيله قبل البدء بالبيع.
          </p>
          <Button variant="outline" className="rounded-xl" onClick={signOut}>تسجيل الخروج</Button>
        </div>
      </div>
    );
  }

  return <AppShell><Outlet /></AppShell>;
}
