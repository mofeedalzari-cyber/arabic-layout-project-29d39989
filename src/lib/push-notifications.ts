// تسجيل إشعارات Push (Firebase Cloud Messaging) على الأندرويد عبر Capacitor.
// آمن تمامًاً في المتصفح (لا يفعل شيئًا).
//
// ملاحظة مهمة: Firebase نفسه يُهيّأ داخل الأندرويد من ملف google-services.json
// (يضعه scripts/setup-android-firebase.mjs في android/app/). إذا كان الملف مفقودًا
// يفشل register() ويظهر ذلك في getPushDiagnostics().

import type { Router } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { persistPushToken } from "./push-token-registration";

const CHANNEL_ID = "karti_requests";

export type PushPhase =
  | "idle"
  | "not-native"
  | "permission-denied"
  | "registered"
  | "registration-error"
  | "failed";

export type PushDiagnostics = {
  phase: PushPhase;
  message: string;
  tokenSaved: boolean;
  foregroundShown: number;
};

let started = false;
let cachedDeviceToken: string | null = null;
let state: PushDiagnostics = {
  phase: "idle",
  message: "",
  tokenSaved: false,
  foregroundShown: 0,
};

export function getPushDiagnostics(): PushDiagnostics {
  return { ...state };
}

function isNative(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window as any).Capacitor?.isNativePlatform?.();
}

async function saveToken(token: string) {
  try {
    const { Capacitor } = await import("@capacitor/core");
    const platform = Capacitor.getPlatform();
    const saved = await persistPushToken(supabase, token, platform);
    state = { ...state, tokenSaved: saved, message: saved ? "تم تسجيل الجهاز للإشعارات." : "بانتظار تسجيل الدخول لحفظ رمز الجهاز." };
  } catch {
    state = { ...state, tokenSaved: false, message: "تعذّر حفظ تسجيل الإشعارات؛ ستتم إعادة المحاولة عند الاتصال أو تسجيل الدخول." };
  }
}

export async function clearPushTokenForSignOut() {
  if (!cachedDeviceToken) return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  const { error } = await supabase.from("device_tokens").delete()
    .eq("token", cachedDeviceToken).eq("user_id", data.session.user.id);
  if (error) throw new Error("تعذّر إلغاء تسجيل الإشعارات؛ حاول تسجيل الخروج مجددًا.");
  state = { ...state, tokenSaved: false };
}

async function showLocalNotification(payload: {
  title?: string;
  body?: string;
  path?: string;
}) {
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== "granted") {
      await LocalNotifications.requestPermissions();
    }
    await LocalNotifications.schedule({
      notifications: [
        {
          id: Math.floor(Date.now() % 1_000_000_000),
          title: payload.title || "كرتي",
          body: payload.body || "",
          smallIcon: "ic_stat_icon_configured",
          extra: { path: payload.path || "/app" },
        },
      ],
    });
    state = { ...state, foregroundShown: state.foregroundShown + 1 };
  } catch {
    /* الإشعار سيظهره النظام عند رجوع التطبيق للخلفية */
  }
}

export async function initPushNotifications(router?: Router<any, any>) {
  if (started) return;
  if (!isNative()) {
    state = { ...state, phase: "not-native", message: "الإشعارات تعمل داخل تطبيق الأندرويد فقط." };
    return;
  }
  started = true;

  // Subscribe before native registration: restored and refreshed sessions also need a save.
  // Defer auth calls outside onAuthStateChange to avoid holding the auth client's lock.
  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") state = { ...state, tokenSaved: false };
    if (["INITIAL_SESSION", "SIGNED_IN", "TOKEN_REFRESHED"].includes(event)) {
      setTimeout(() => {
        if (cachedDeviceToken) void saveToken(cachedDeviceToken);
      }, 0);
    }
  });
  window.addEventListener("online", () => {
    if (cachedDeviceToken) void saveToken(cachedDeviceToken);
  });

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive !== "granted") {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== "granted") {
      state = {
        ...state,
        phase: "permission-denied",
        message: "إذن الإشعارات مرفوض — فعّله من إعدادات التطبيق على الجهاز.",
      };
      return;
    }

    // قناة إشعارات عالية الأهمية (تظهر أعلى الشاشة مع صوت واهتزاز)
    try {
      await PushNotifications.createChannel({
        id: CHANNEL_ID,
        name: "طلبات وإشعارات كرتي",
        description: "إشعارات طلبات سحب الكروت والموافقات",
        importance: 5,
        visibility: 1,
        vibration: true,
        sound: "default",
      });
    } catch {
      /* القناة قد تكون موجودة */
    }

    // التطبيق في المقدمة؟ نعرض الإشعار يدويًا لأن النظام لا يعرضه وهو مفتوح
    let appActive = true;
    try {
      const { App } = await import("@capacitor/app");
      appActive = (await App.getState()).isActive;
      void App.addListener("appStateChange", ({ isActive }) => {
        appActive = isActive;
      });
    } catch {
      /* متابعة بدون تتبع الحالة */
    }

    PushNotifications.addListener("registration", (t) => {
      if (t?.value) {
        cachedDeviceToken = t.value;
        state = { ...state, phase: "registered", message: "رمز الجهاز جاهز." };
        void saveToken(t.value);
      }
    });

    PushNotifications.addListener("registrationError", (err) => {
      state = {
        ...state,
        phase: "registration-error",
        message:
          "تعذّر تسجيل الجهاز في Firebase. تأكد من وجود android/app/google-services.json",
      };
      console.warn("push registration failed");
    });

    PushNotifications.addListener("pushNotificationReceived", (notification) => {
      if (!appActive) return; // في الخلفية يتكفّل النظام بالعرض
      const data = (notification?.data ?? {}) as Record<string, string>;
      void showLocalNotification({
        title: notification?.title ?? undefined,
        body: notification?.body ?? data.body,
        path: data.path,
      });
    });

    // فتح الصفحة المناسبة عند الضغط على الإشعار
    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const path = (action?.notification?.data as any)?.path as string | undefined;
      if (!path) return;
      try {
        router?.navigate({ to: path as any });
      } catch {
        window.location.assign(path);
      }
    });

    await PushNotifications.register();

    // عند رجوع التطبيق للأمام نعيد التسجيل حتى لا تتقادم الرموز
    try {
      const { App } = await import("@capacitor/app");
      void App.addListener("resume", () => {
        if (cachedDeviceToken) void saveToken(cachedDeviceToken);
        PushNotifications.register().catch(() => {});
      });
    } catch {
      /* غير متاح */
    }
  } catch (error) {
    state = {
      ...state,
      phase: "failed",
      message: error instanceof Error ? error.message : "تعذّر تشغيل خدمة الإشعارات.",
    };
    console.warn("push init failed:", error);
  }
}
