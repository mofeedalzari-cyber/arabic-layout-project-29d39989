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
