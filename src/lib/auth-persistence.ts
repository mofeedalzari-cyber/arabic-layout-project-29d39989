// يحفظ جلسة الدخول في التخزين الأصلي للجهاز (Capacitor Preferences)
// حتى لا يفقد المستخدم تسجيل الدخول عند إغلاق التطبيق وإعادة فتحه،
// لأن WebView في أندرويد قد يمسح localStorage.

const PREFIX = "sb-";
const isSupabaseKey = (k: string) => k.startsWith(PREFIX) || k.includes("supabase");

let ready: Promise<void> | null = null;
let mirrorInstalled = false;

function isNative(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as any).Capacitor;
  return !!cap?.isNativePlatform?.();
}

async function prefs() {
  const { Preferences } = await import("@capacitor/preferences");
  return Preferences;
}

/** ينسخ مفاتيح الجلسة من التخزين الأصلي إلى localStorage قبل تهيئة Supabase. */
export function ensureAuthStorageReady(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    if (!isNative()) return;
    try {
      const P = await prefs();
      const { keys } = await P.keys();
      for (const key of keys) {
        if (!isSupabaseKey(key)) continue;
        const { value } = await P.get({ key });
        if (value != null && window.localStorage.getItem(key) == null) {
          window.localStorage.setItem(key, value);
        }
      }
    } catch (e) {
      console.error("[auth] restore native session failed", e);
    }
    installMirror();
  })();
  return ready;
}

/** يعكس أي كتابة/حذف لمفاتيح الجلسة إلى التخزين الأصلي. */
function installMirror() {
  if (mirrorInstalled || !isNative()) return;
  mirrorInstalled = true;
  const ls = window.localStorage;
  const origSet = ls.setItem.bind(ls);
  const origRemove = ls.removeItem.bind(ls);
  const origClear = ls.clear.bind(ls);

  ls.setItem = (key: string, value: string) => {
    origSet(key, value);
    if (isSupabaseKey(key)) {
      void prefs()
        .then((P) => P.set({ key, value }))
        .catch(() => {});
    }
  };
  ls.removeItem = (key: string) => {
    origRemove(key);
    if (isSupabaseKey(key)) {
      void prefs()
        .then((P) => P.remove({ key }))
        .catch(() => {});
    }
  };
  ls.clear = () => {
    origClear();
    void prefs()
      .then((P) => P.clear())
      .catch(() => {});
  };
}

/** يمسح الجلسة المحفوظة أصليًا (عند تسجيل الخروج). */
export async function clearNativeAuthStorage() {
  if (!isNative()) return;
  try {
    const P = await prefs();
    const { keys } = await P.keys();
    await Promise.all(keys.filter(isSupabaseKey).map((key) => P.remove({ key })));
  } catch {}
}
