import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "كرتي — إدارة وبيع كروت الإنترنت" },
      {
        name: "description",
        content: "منصة احترافية لإدارة وبيع كروت الإنترنت للمديرين والمناديب.",
      },
      { property: "og:title", content: "كرتي — إدارة وبيع كروت الإنترنت" },
      {
        property: "og:description",
        content: "سجّل الدخول لإدارة الشبكات والباقات والكروت ومتابعة مبيعات المناديب.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: IndexRedirect,
});

function IndexRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate({ to: "/auth", replace: true });
  }, [navigate]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4" dir="rtl">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-foreground">كرتي</h1>
        <p className="mt-2 text-sm text-muted-foreground">جارٍ تحويلك إلى صفحة تسجيل الدخول…</p>
        <a
          href="/auth"
          className="mt-6 inline-flex items-center justify-center rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          تسجيل الدخول
        </a>
      </div>
    </div>
  );
}
