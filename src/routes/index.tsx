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
  const { user, loading } = useAuth();

  // ننتظر استعادة الجلسة المحفوظة أولًا: إن كان المستخدم مسجّلًا نذهب للتطبيق
  // مباشرة بدون إظهار صفحة تسجيل الدخول.
  useEffect(() => {
    if (loading) return;
    navigate({ to: user ? "/app" : "/auth", replace: true });
  }, [loading, user, navigate]);

  // حماية: إن تعطّل التحقق من الجلسة (WebView بدون إنترنت مثلًا) لا نبقى
  // على شاشة "جارٍ التحميل" للأبد — ننتقل لصفحة الدخول بعد مهلة قصيرة.
  useEffect(() => {
    const t = setTimeout(() => {
      if (typeof window !== "undefined" && window.location.pathname === "/") {
        window.location.replace("/auth");
      }
    }, 6000);
    return () => clearTimeout(t);
  }, []);


  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4" dir="rtl">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-foreground">كرتي</h1>
        <p className="mt-2 text-sm text-muted-foreground">جارٍ التحميل…</p>
      </div>
    </div>
  );
}
