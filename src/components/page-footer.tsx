import { Heart } from "lucide-react";

export function PageFooter() {
  return (
    <footer dir="rtl" className="w-full py-3 text-center">
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        جميع الحقوق محفوظة © 2026 •
      </p>
      <p className="text-[11px] leading-relaxed text-muted-foreground mt-0.5">
        برمجة وتصميم{" "}
        <Heart
          className="inline h-3 w-3 text-red-500 align-text-bottom mx-0.5"
          fill="currentColor"
        />{" "}
        <span className="font-semibold text-foreground">مفيد الزري</span>
      </p>
    </footer>
  );
}
