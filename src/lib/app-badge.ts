// شارة العدد على أيقونة التطبيق (مثل فيسبوك)
// - أندرويد/iOS: عبر إضافة Capacitor Badge
// - الويب/PWA المثبّت: عبر Badging API (navigator.setAppBadge)

function isNative(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as any).Capacitor;
  return !!cap?.isNativePlatform?.();
}

let permissionAsked = false;

async function nativeBadge() {
  const { Badge } = await import("@capawesome/capacitor-badge");
  if (!permissionAsked) {
    permissionAsked = true;
    try {
      const perm = await Badge.checkPermissions();
      if (perm.display !== "granted") await Badge.requestPermissions();
    } catch {
      /* ignore */
    }
  }
  return Badge;
}

/** يضبط رقم الشارة على أيقونة التطبيق. القيمة 0 تُزيل الشارة. */
export async function setAppBadge(count: number) {
  const n = Math.max(0, Math.floor(count || 0));
  try {
    if (isNative()) {
      const Badge = await nativeBadge();
      if (n > 0) await Badge.set({ count: n });
      else await Badge.clear();
      return;
    }
    const nav = navigator as any;
    if (typeof nav?.setAppBadge === "function") {
      if (n > 0) await nav.setAppBadge(n);
      else await nav.clearAppBadge?.();
    }
  } catch {
    /* الشارة غير مدعومة على هذا الجهاز/المشغّل */
  }
}

/** يزيل الشارة تمامًا. */
export async function clearAppBadge() {
  await setAppBadge(0);
}
