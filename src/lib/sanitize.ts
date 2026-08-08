// Input hardening helpers (defense in depth).
// React already escapes rendered text, and the app never uses
// dangerouslySetInnerHTML with user data. These helpers strip control
// characters / markup from values before they are stored, exported to
// PDF, or placed into URLs.

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Remove HTML/JS injection characters and control chars from free text. */
export function sanitizeText(value: unknown, maxLength = 500): string {
  if (typeof value !== "string") return "";
  return value
    .replace(CONTROL_CHARS, "")
    .replace(/<[^>]*>/g, "") // strip tags
    .replace(/[<>]/g, "")
    .replace(/\s{3,}/g, "  ")
    .trim()
    .slice(0, maxLength);
}

/** Digits only — for phone numbers and card identifiers. */
export function sanitizeDigits(value: unknown, maxLength = 20): string {
  if (typeof value !== "string") return "";
  return value.replace(/\D/g, "").slice(0, maxLength);
}

/** Safe URL query value. */
export function safeParam(value: unknown): string {
  return encodeURIComponent(sanitizeText(value, 1000));
}

/** Allow only http(s) links (blocks javascript:/data: URLs). */
export function safeHref(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value, "https://example.invalid");
    return url.protocol === "https:" || url.protocol === "http:" ? value : undefined;
  } catch {
    return undefined;
  }
}
