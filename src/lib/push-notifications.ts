// تسجيل إشعارات Push (Firebase Cloud Messaging) على الأندرويد عبر Capacitor.
// آمن تمامًا في المتصفح (لا يفعل شيئًا).

import type { Router } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

let started = false;

function isNative(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window as any).Capacitor?.isNativePlatform?.();
}

async function saveToken(token: string) {
  try {
    await supabase.rpc("register_device_token", { _token: token, _platform: "android" });
  } catch {
    /* ignore */
  }
}

export async function initPushNotifications(router?: Router<any, any>) {
  if (started || !isNative()) return;
  started = true;

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive !== "granted") {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== "granted") return;

    PushNotifications.addListener("registration", (t) => {
      if (t?.value) void saveToken(t.value);
    });

    PushNotifications.addListener("registrationError", () => {
      /* ignore */
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

    // إعادة تسجيل الرمز عند تسجيل الدخول بحساب آخر
    supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        PushNotifications.register().catch(() => {});
      }
    });
  } catch {
    /* غير متاح — تجاهل */
  }
}
