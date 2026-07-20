// Native (Capacitor) integration: splash screen, status bar, deep links, offline detection.
// Safe no-op in web browsers.

import type { Router } from "@tanstack/react-router";
import { addBreadcrumb } from "./sentry";

let initialized = false;

function isNative(): boolean {
  if (typeof window === "undefined") return false;
  // @ts-ignore
  return !!(window as any).Capacitor?.isNativePlatform?.();
}

/**
 * Convert an incoming URL from a Deep Link to an in-app path.
 * Supports:
 *  - https://arabic-layout-project.onrender.com/app/cabin
 *  - wificards://app/cabin
 */
function urlToPath(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const path = (u.pathname || "/") + (u.search || "") + (u.hash || "");
    return path || "/";
  } catch {
    return null;
  }
}

export async function initCapacitorNative(router: Router<any, any>) {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  if (!isNative()) return;

  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    const { App } = await import("@capacitor/app");

    // Status bar — edge-to-edge with safe-area insets
    try {
      await StatusBar.setOverlaysWebView({ overlay: true });
      await StatusBar.setBackgroundColor({ color: "#00968800" });
      await StatusBar.setStyle({ style: Style.Dark });
    } catch {}

    // Hide splash after the app is ready
    setTimeout(() => {
      SplashScreen.hide({ fadeOutDuration: 300 }).catch(() => {});
    }, 400);

    // Deep links (App Links / custom scheme)
    App.addListener("appUrlOpen", (event) => {
      const path = urlToPath(event.url);
      addBreadcrumb("deep-link: appUrlOpen", { url: event.url, path });
      if (path) {
        try {
          router.navigate({ to: path as any });
        } catch {
          window.location.assign(path);
        }
      }
    });

    // Android back button — go back in history, otherwise "press again to exit"
    let lastBackPress = 0;
    App.addListener("backButton", ({ canGoBack }) => {
      // If a modal/sheet is open, let the browser default close it first
      const openOverlay = document.querySelector(
        '[data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"]',
      );
      if (openOverlay) {
        const closeBtn = openOverlay.querySelector<HTMLElement>('[data-dismiss], [aria-label="Close"], [aria-label="إغلاق"]');
        if (closeBtn) closeBtn.click();
        else window.history.back();
        return;
      }
      if (canGoBack && window.history.length > 1) {
        window.history.back();
        return;
      }
      const now = Date.now();
      if (now - lastBackPress < 2000) {
        App.exitApp().catch(() => App.minimizeApp().catch(() => {}));
      } else {
        lastBackPress = now;
        try {
          const { Toast } = await import("@capacitor/toast").catch(() => ({ Toast: null as any }));
          if (Toast) await Toast.show({ text: "اضغط مرة أخرى للخروج", duration: "short" });
        } catch {}
      }
    });
  } catch (err) {
    // Not running in a native shell — ignore.
    console.warn("[capacitor-native] init skipped:", err);
  }
}
