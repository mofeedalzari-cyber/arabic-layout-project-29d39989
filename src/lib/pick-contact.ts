import { Capacitor } from "@capacitor/core";

export interface PickedContact {
  name: string;
  phone: string;
}

/**
 * Opens the device contact picker and returns the selected contact's
 * display name + first phone number. Returns null if user cancels or on error.
 * Works on Capacitor Android/iOS and on browsers supporting the Contact Picker API.
 */
export async function pickContact(): Promise<PickedContact | null> {
  try {
    if (Capacitor.isNativePlatform()) {
      const mod = await import("@capacitor-community/contacts");
      const Contacts: any = (mod as any).Contacts;
      // Request permission
      const perm = await Contacts.requestPermissions();
      const granted = perm?.contacts === "granted" || perm?.contacts === true;
      if (!granted) return null;
      const res = await Contacts.pickContact({
        projection: { name: true, phones: true },
      });
      const c = res?.contact;
      if (!c) return null;
      const name: string =
        c.name?.display || [c.name?.given, c.name?.family].filter(Boolean).join(" ") || "";
      const phone: string = c.phones?.[0]?.number || "";
      if (!name && !phone) return null;
      return { name: name.trim(), phone: String(phone).trim() };
    }

    // Web Contact Picker API (Chrome Android on secure origins)
    const anyNav = navigator as any;
    if (anyNav?.contacts && typeof anyNav.contacts.select === "function") {
      const contacts = await anyNav.contacts.select(["name", "tel"], { multiple: false });
      const c = contacts?.[0];
      if (!c) return null;
      return {
        name: (c.name?.[0] ?? "").trim(),
        phone: (c.tel?.[0] ?? "").trim(),
      };
    }
  } catch (err) {
    console.warn("pickContact failed", err);
  }
  return null;
}
