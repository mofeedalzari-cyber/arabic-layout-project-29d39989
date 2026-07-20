import { MessageCircle, Music2, Facebook } from "lucide-react";

const WHATSAPP = "967778492884";
const TIKTOK = "https://www.tiktok.com/@mufeed_saleh_ali_alzree?_r=1&_t=ZS-985kXzSNgqi";
const FACEBOOK = "https://www.facebook.com/share/1BtWzohGEG/";

export function SiteFooter() {
  return (
    <footer
      dir="rtl"
      className="relative overflow-hidden border-t border-border/60 bg-gradient-to-br from-background via-background to-primary/5"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      {/* Glow accents */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
      <div className="pointer-events-none absolute -top-16 right-1/4 h-32 w-32 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 left-1/4 h-32 w-32 rounded-full bg-primary/10 blur-3xl" />

      <div className="relative mx-auto flex max-w-5xl flex-col items-center gap-3 px-4 py-5 sm:py-6">
        {/* Copyright */}
        <p className="text-center text-xs font-semibold text-foreground sm:text-sm">
          جميع الحقوق محفوظة
        </p>

        <div className="h-px w-12 bg-border/60" />

        {/* Credits */}
        <p className="text-center text-xs font-medium text-muted-foreground sm:text-sm">
          برمجة وتصميم <span className="font-semibold text-foreground">مفيد الزري</span>
        </p>

        {/* Social links */}
        <div className="flex items-center gap-2 sm:gap-3">
          <a
            href={`https://wa.me/${WHATSAPP}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="واتساب"
            className="group inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/80 px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/10 hover:shadow-md sm:text-sm"
            dir="ltr"
          >
            <MessageCircle className="h-4 w-4 text-emerald-500 transition-transform group-hover:scale-110" />
            <span>+{WHATSAPP}</span>
          </a>

          <a
            href={TIKTOK}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="تيك توك"
            className="group inline-grid h-9 w-9 place-items-center rounded-full border border-border/60 bg-card/80 text-foreground shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/10 hover:shadow-md"
          >
            <Music2 className="h-4 w-4 transition-transform group-hover:scale-110" />
          </a>

          <a
            href={FACEBOOK}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="فيسبوك"
            className="group inline-grid h-9 w-9 place-items-center rounded-full border border-border/60 bg-card/80 text-foreground shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-[#1877F2]/10 hover:shadow-md"
          >
            <Facebook className="h-4 w-4 text-[#1877F2] transition-transform group-hover:scale-110" />
          </a>
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;
