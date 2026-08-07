import { Input } from "@/components/ui/input";
import { Link } from "@tanstack/react-router";
import { Eye, EyeOff, ChevronRight, Heart } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import logo from "@/assets/wifi-store-logo.png";

export const APP_NAME = "كرتي";
export const SITE_URL = "https://arabic-layout-project.lovable.app";

export const phoneSchema = z
  .string()
  .trim()
  .min(6, "رقم الهاتف غير صحيح")
  .max(20)
  .regex(/^[0-9+\-\s]+$/, "أرقام فقط");

export const passwordSchema = z.string().min(6, "6 أحرف على الأقل").max(72);

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      dir="rtl"
      className="min-h-dvh overflow-y-auto overscroll-contain bg-[#eaf7ef] flex flex-col overflow-x-hidden"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="flex-1 flex flex-col justify-center px-3 sm:px-4 py-4 sm:py-6 md:py-8">
        {children}
      </div>
      <PageFooter />
    </div>
  );
}

export function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-md mx-auto bg-white rounded-[26px] shadow-[0_10px_36px_-18px_rgba(16,24,40,0.18)] border border-gray-100 px-5 sm:px-6 py-6 flex flex-col min-h-[480px] md:min-h-[560px] mb-3">
      {children}
    </div>
  );
}

export function BrandHeader({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex flex-col items-center text-center mb-4 sm:mb-5">
      <img
        src={logo}
        alt="شعار تطبيق كرتي"
        width={96}
        height={96}
        className="h-16 w-16 sm:h-20 sm:w-20 object-contain"
      />
      <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight mt-1 text-gray-900 leading-tight">
        {APP_NAME} — نظام إدارة وبيع كروت
      </h1>
      {subtitle && (
        <p className="text-gray-600 mt-1.5 sm:mt-2 text-sm sm:text-base">{subtitle}</p>
      )}
    </div>
  );
}

export function TypeCard({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-2 rounded-[20px] p-3 h-[116px] transition-all duration-200 border-2 ${
        active
          ? "border-[#0f766e] bg-gradient-to-b from-[#e6f5f2] to-[#cfeae5] shadow-[0_0_0_4px_rgba(15,118,110,0.08)]"
          : "border-transparent bg-[#eceeed]"
      }`}
    >
      <div
        className={`h-12 w-12 rounded-full flex items-center justify-center transition ${
          active ? "bg-[#0f766e] text-white" : "bg-[#d9dddb] text-white"
        }`}
      >
        {icon}
      </div>
      <div
        className={`text-base font-bold leading-tight text-center ${
          active ? "text-[#0b4f4a]" : "text-gray-700"
        }`}
      >
        {label}
      </div>
    </button>
  );
}

export function SoftInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return (
    <Input
      dir="rtl"
      {...rest}
      className={`h-14 rounded-2xl bg-[#eceeed] border-0 text-right text-base text-gray-800 placeholder:text-gray-600 focus-visible:ring-2 focus-visible:ring-[#0f766e] px-4 ${className}`}
    />
  );
}

export function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  className?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <SoftInput
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "كلمة المرور"}
        autoComplete={autoComplete ?? "current-password"}
        className={`pl-12 ${className ?? ""}`}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
        className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-700 p-1"
      >
        {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </button>
    </div>
  );
}

export function NetworkSelect({
  value,
  onChange,
  networks,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  networks: { id: string; name: string }[];
  placeholder?: string;
}) {
  return (
    <select
      dir="rtl"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-14 rounded-2xl bg-[#eceeed] border-0 text-right text-base text-gray-700 focus-visible:ring-2 focus-visible:ring-[#0f766e] px-4"
    >
      <option value="">{placeholder ?? "اختر الشبكة التي تتبع لها"}</option>
      {networks.map((n) => (
        <option key={n.id} value={n.name}>
          {n.name}
        </option>
      ))}
    </select>
  );
}

export function SocialBtn({
  href,
  label,
  children,
  colorClass,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
  colorClass?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className={`h-12 w-12 rounded-full bg-[#f1f3f2] flex items-center justify-center transition-transform hover:scale-105 active:scale-95 ${colorClass ?? "text-[#9aa5a0]"}`}
    >
      {children}
    </a>
  );
}

export function AuthFooter() {
  return (
    <div className="pt-6">
      <div className="flex items-center justify-center gap-4">
        <SocialBtn
          href="https://wa.me/967778492884"
          label="واتساب"
          colorClass="text-[#25D366]"
        >
          <WhatsAppIcon />
        </SocialBtn>
        <SocialBtn
          href="https://www.tiktok.com/@mufeed_saleh_ali_alzree?_r=1&_t=ZS-98C0Jv2XQOa"
          label="تيك توك"
          colorClass="text-black"
        >
          <TikTokIcon />
        </SocialBtn>
        <SocialBtn
          href="https://www.facebook.com/share/1BanCjCw8T/"
          label="فيسبوك"
          colorClass="text-[#1877F2]"
        >
          <FacebookIcon />
        </SocialBtn>
      </div>
    </div>
  );
}

export function BackToLogin() {
  return (
    <p className="text-center text-sm text-gray-800">
      لديك حساب بالفعل؟{" "}
      <Link
        to="/auth"
        className="text-[#0f766e] font-bold underline underline-offset-4"
      >
        سجل الدخول من هنا
      </Link>
    </p>
  );
}

export function TypeRow({
  icon,
  iconBg,
  title,
  desc,
  onClick,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-4 p-3 rounded-2xl hover:bg-gray-50 text-right"
    >
      <div
        className={`h-14 w-14 rounded-full ${iconBg} flex items-center justify-center shrink-0`}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xl font-bold text-gray-900">{title}</div>
        <div className="text-sm text-gray-600 mt-0.5">{desc}</div>
      </div>
      <ChevronRight className="h-5 w-5 text-gray-400 shrink-0" />
    </button>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
      <path d="M20.52 3.48A11.86 11.86 0 0 0 12.06 0C5.5 0 .17 5.33.17 11.9c0 2.1.55 4.15 1.6 5.96L0 24l6.32-1.66a11.9 11.9 0 0 0 5.73 1.46h.01c6.56 0 11.9-5.33 11.9-11.9 0-3.18-1.24-6.17-3.44-8.42ZM12.06 21.5h-.01a9.6 9.6 0 0 1-4.9-1.34l-.35-.21-3.75.98 1-3.65-.23-.37a9.58 9.58 0 0 1-1.47-5.11c0-5.3 4.32-9.62 9.62-9.62 2.57 0 4.98 1 6.8 2.82a9.55 9.55 0 0 1 2.82 6.81c0 5.3-4.32 9.63-9.53 9.69Zm5.28-7.2c-.29-.14-1.71-.85-1.98-.94-.27-.1-.46-.14-.66.14-.19.29-.76.94-.93 1.14-.17.19-.34.22-.63.07-.29-.14-1.22-.45-2.33-1.44-.86-.77-1.44-1.72-1.61-2.01-.17-.29-.02-.45.13-.6.13-.13.29-.34.44-.51.14-.17.19-.29.29-.48.1-.19.05-.36-.02-.51-.07-.14-.66-1.59-.9-2.18-.24-.57-.48-.49-.66-.5H8.9c-.19 0-.5.07-.76.36-.26.29-1 .98-1 2.39s1.02 2.77 1.17 2.96c.14.19 2 3.05 4.86 4.28.68.29 1.21.47 1.62.6.68.22 1.3.19 1.79.11.55-.08 1.71-.7 1.95-1.37.24-.67.24-1.24.17-1.37-.07-.13-.26-.2-.55-.34Z" />
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
      <path d="M19.6 6.32a5.9 5.9 0 0 1-3.44-1.1 5.87 5.87 0 0 1-2.31-3.72h-3.2v13.14a2.66 2.66 0 1 1-1.87-2.54v-3.3a5.94 5.94 0 1 0 5.07 5.88V9.34a9.06 9.06 0 0 0 5.75 2.03V8.16c0-.63-.01-1.24 0-1.84Z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
      <path d="M22.68 0H1.32C.59 0 0 .58 0 1.31v21.38C0 23.42.59 24 1.32 24h11.5v-9.29H9.69V11.1h3.13V8.41c0-3.1 1.89-4.79 4.66-4.79 1.32 0 2.46.1 2.79.14v3.24h-1.92c-1.5 0-1.8.72-1.8 1.76v2.31h3.59l-.47 3.62h-3.12V24h6.13c.73 0 1.32-.58 1.32-1.31V1.31C24 .58 23.41 0 22.68 0Z" />
    </svg>
  );
}
