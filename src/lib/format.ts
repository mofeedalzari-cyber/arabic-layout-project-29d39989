export function fmtMoney(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

export function cleanPhoneLike(value?: string | null) {
  const s = String(value ?? "").trim();
  if (!s) return "";
  if (/^u\d+$/i.test(s)) return s.slice(1);
  if (/^\d+u$/i.test(s)) return s.slice(0, -1);
  return s;
}

export function displayPhone(phone?: string | null, username?: string | null) {
  return cleanPhoneLike(phone) || cleanPhoneLike(username) || "—";
}

/** Arabic date+time+weekday, e.g. "٢١‏/٧‏/٢٠٢٦، ٧:٠٤ م الثلاثاء" */
export function fmtArabicDateTime(value?: string | number | Date | null) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "—";
  const dt = d.toLocaleString("ar-EG", {
    year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
  const wd = d.toLocaleString("ar-EG", { weekday: "long" });
  return `${dt} ${wd}`;
}

/** Arabic date only, e.g. "٢١‏/٧‏/٢٠٢٦ الثلاثاء" */
export function fmtArabicDate(value?: string | number | Date | null) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "—";
  const dt = d.toLocaleDateString("ar-EG", { year: "numeric", month: "numeric", day: "numeric" });
  const wd = d.toLocaleString("ar-EG", { weekday: "long" });
  return `${dt} ${wd}`;
}

