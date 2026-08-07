import { Heart } from "lucide-react";

export function PageFooter() {
  return (
    <footer dir="rtl" className="w-full py-3 text-center">
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        برمجة وتصميم{" "}
        <span className="font-semibold text-foreground">مفيد الزري</span>{" "}
        <Heart
          className="inline h-3 w-3 text-red-500 align-text-bottom mx-0.5"
          fill="currentColor"
        />{" "}
        تحت جميع الحقوق محفوظة © 2026 •
      </p>
    </footer>
  );
}
