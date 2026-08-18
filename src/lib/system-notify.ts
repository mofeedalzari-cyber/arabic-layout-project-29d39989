// إشعارات نظام تظهر أعلى الشاشة (Heads-up) — تعمل على:
// 1) تطبيق الأندرويد عبر Capacitor LocalNotifications
// 2) المتصفح/PWA عبر Service Worker Notification
// آمنة تمامًا في SSR.

let nativeChannelReady = false;
let webPermissionAsked = false;

function isNative(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window as any).Capacitor?.isNativePlatform?.();
}

/** طلب إذن الإشعارات مرة واحدة (يُنادى بعد تسجيل الدخول) */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  if (isNative()) {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      let perm = await LocalNotifications.checkPermissions();
      if (perm.display !== "granted") perm = await LocalNotifications.requestPermissions();
      if (perm.display !== "granted") return false;
      if (!nativeChannelReady) {
        nativeChannelReady = true;
        try {
          await LocalNotifications.createChannel({
            id: "karti_alerts",
            name: "تنبيهات كرتي",
            description: "طلبات سحب الكروت وطلبات الانضمام والقرارات",
            importance: 5,
            visibility: 1,
            vibration: true,
            sound: "default",
          });
        } catch {
          /* ignore */
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  if (webPermissionAsked) return false;
  webPermissionAsked = true;
  try {
    const res = await Notification.requestPermission();
    return res === "granted";
  } catch {
    return false;
  }
}

export type SystemNotifyInput = {
  title: string;
  body?: string;
  /** نص مفصل يظهر عند توسيع الإشعار (Android) */
  largeBody?: string;
  /** مسار داخل التطبيق يُفتح عند الضغط */
  path?: string;
  tag?: string;
};

/** إظهار إشعار نظام أعلى الشاشة */
export async function systemNotify({ title, body, path, tag }: SystemNotifyInput): Promise<void> {
  if (typeof window === "undefined") return;
  const allowed = await ensureNotificationPermission();
  if (!allowed) return;

  if (isNative()) {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      await LocalNotifications.schedule({
        notifications: [
          {
            id: Math.floor(Math.random() * 2_000_000_000),
            title,
            body: body ?? "",
            channelId: "karti_alerts",
            smallIcon: "ic_stat_icon_config_sample",
            extra: { path },
          },
        ],
      });
    } catch {
      /* ignore */
    }
    return;
  }

  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const options: NotificationOptions & { vibrate?: number[] } = {
      body,
      icon: "/app-icon.png",
      badge: "/app-icon.png",
      tag,
      data: { path: path ?? "/app" },
      vibrate: [120, 60, 120],
    };
    if (reg) {
      await reg.showNotification(title, options);
    } else {
      new Notification(title, options);
    }
  } catch {
    /* ignore */
  }
}
