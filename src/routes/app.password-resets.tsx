import { createFileRoute, Navigate } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/app-shell";
import { RefreshButton } from "@/components/refresh-button";
import { ResetRequestsPanel } from "@/components/reset-requests-panel";

export const Route = createFileRoute("/app/password-resets")({
  head: () => ({
    meta: [
      { title: "استعادة كلمة المرور — كرتي" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "إدارة طلبات استعادة كلمة المرور لمدير التطبيق." },
      { property: "og:title", content: "استعادة كلمة المرور — كرتي" },
      { property: "og:description", content: "إدارة طلبات استعادة كلمة المرور لمدير التطبيق." },
    ],
  }),
  component: PasswordResetsPage,
});

function PasswordResetsPage() {
  const { loading, isSuperadmin } = useAuth();
  if (loading) return null;
  if (!isSuperadmin) return <Navigate to="/app" />;

  return (
    <div dir="rtl" className="space-y-4">
      <PageHeader
        title="استعادة كلمة المرور"
        description="طلبات استعادة كلمة المرور من المديرين والمناديب"
        action={<RefreshButton />}
      />
      <ResetRequestsPanel />
    </div>
  );
}
