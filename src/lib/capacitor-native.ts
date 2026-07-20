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

  document.documentElement.classList.add("capacitor-native");

  const applyNativeSafeArea = async (StatusBar?: { getInfo?: () => Promise<{ height?: number }> }) => {
    const statusInfo = await StatusBar?.getInfo?.().catch(() => undefined);
    const statusHeight = Math.max(statusInfo?.height ?? 0, 30);

    document.documentElement.style.setProperty("--app-safe-top", `${statusHeight}px`);
    document.documentElement.style.setProperty("--app-safe-bottom", "48px");
  };

  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    const { App } = await import("@capacitor/app");

    // Status bar — edge-to-edge with safe-area insets
    try {
      await StatusBar.setOverlaysWebView({ overlay: true });
      await StatusBar.setBackgroundColor({ color: "#00968800" });
      await StatusBar.setStyle({ style: Style.Dark });
      await applyNativeSafeArea(StatusBar);
    } catch {}

    window.addEventListener("resize", () => { applyNativeSafeArea(StatusBar).catch(() => {}); });
    window.visualViewport?.addEventListener("resize", () => { applyNativeSafeArea(StatusBar).catch(() => {}); });

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
    App.addListener("backButton", async ({ canGoBack }) => {
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
        // Lightweight in-app hint (no extra plugin required)
        try {
          const hint = document.createElement("div");
          hint.textContent = "اضغط مرة أخرى للخروج";
          hint.style.cssText =
            "position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom) + 90px);transform:translateX(-50%);background:#111c;color:#fff;padding:8px 16px;border-radius:999px;font:600 13px Cairo,Tahoma,sans-serif;z-index:9999;pointer-events:none;transition:opacity .3s;";
          document.body.appendChild(hint);
          setTimeout(() => { hint.style.opacity = "0"; }, 1500);
          setTimeout(() => hint.remove(), 1900);
        } catch {}
      }
    });
  } catch (err) {
    // Not running in a native shell — ignore.
    console.warn("[capacitor-native] init skipped:", err);
  }
}
