import { Capacitor } from "@capacitor/core";

export interface PickedContact {
  name: string;
  phone: string;
}

export type PickContactError =
  | "unsupported"
  | "permission_denied"
  | "cancelled"
  | "failed";

export interface PickContactResult {
  ok: boolean;
  contact?: PickedContact;
  error?: PickContactError;
  message?: string;
}

/**
 * Opens the device contact picker. Works on Capacitor Android/iOS.
 * On web browsers, uses the Contact Picker API when available (Chrome on Android over HTTPS).
 */
export async function pickContact(): Promise<PickContactResult> {
  // Native Capacitor
  if (Capacitor.isNativePlatform()) {
    try {
      const mod = await import("@capacitor-community/contacts");
      const Contacts: any = (mod as any).Contacts;
      const perm = await Contacts.requestPermissions();
      const granted = perm?.contacts === "granted" || perm?.contacts === true;
      if (!granted) {
        return { ok: false, error: "permission_denied", message: "لم يتم منح صلاحية الوصول لجهات الاتصال" };
      }
      const res = await Contacts.pickContact({ projection: { name: true, phones: true } });
      const c = res?.contact;
      if (!c) return { ok: false, error: "cancelled" };
      const name: string =
        c.name?.display || [c.name?.given, c.name?.family].filter(Boolean).join(" ") || "";
      const phone: string = c.phones?.[0]?.number || "";
      if (!name && !phone) return { ok: false, error: "cancelled" };
      return { ok: true, contact: { name: name.trim(), phone: String(phone).trim() } };
    } catch (err: any) {
      return { ok: false, error: "failed", message: err?.message ?? "فشل الوصول لجهات الاتصال" };
    }
  }

  // Web Contact Picker API — only works in the top frame, over HTTPS, on Chrome Android.
  const anyNav = navigator as any;
  const inIframe = (() => { try { return window.top !== window.self; } catch { return true; } })();
  if (anyNav?.contacts && typeof anyNav.contacts.select === "function" && !inIframe) {
    try {
      const contacts = await anyNav.contacts.select(["name", "tel"], { multiple: false });
      const c = contacts?.[0];
      if (!c) return { ok: false, error: "cancelled" };
      return {
        ok: true,
        contact: {
          name: (c.name?.[0] ?? "").trim(),
          phone: (c.tel?.[0] ?? "").trim(),
        },
      };
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      if (/top frame/i.test(msg)) {
        return { ok: false, error: "unsupported", message: "جهات الاتصال متاحة داخل تطبيق أندرويد فقط — أدخل البيانات يدوياً" };
      }
      return { ok: false, error: "failed", message: msg || "فشل جلب جهة الاتصال" };
    }
  }

  return {
    ok: false,
    error: "unsupported",
    message: "جهات الاتصال متاحة داخل تطبيق أندرويد فقط — أدخل البيانات يدوياً هنا",
  };
}
