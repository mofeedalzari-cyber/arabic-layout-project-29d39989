import type { CapacitorConfig } from "@capacitor/cli";
import { config as loadEnv } from "dotenv";

// تحميل متغيرات .env لأن Capacitor CLI لا يحمّلها تلقائياً
loadEnv();

const PRODUCTION_APP_URL = "https://arabic-layout-project-g2h5.onrender.com";

function getAppUrl(): string {
  const configuredUrl = process.env['VITE_APP_URL']?.trim();
  if (!configuredUrl) return PRODUCTION_APP_URL;

  try {
    const parsed = new URL(configuredUrl);
    const isLocalhost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    const isOfflinePage = parsed.pathname.toLowerCase().includes("offline.html");
    return isLocalhost || isOfflinePage ? PRODUCTION_APP_URL : parsed.origin;
  } catch {
    return PRODUCTION_APP_URL;
  }
}

const appUrl = getAppUrl();
const appHostname = appUrl.startsWith("http") ? new URL(appUrl).hostname : appUrl;

const config: CapacitorConfig = {
  appId: "com.mofeed.karti",
  appName: "كرتي",
  webDir: ".output/public",
  server: {
    url: appUrl,
    androidScheme: "https",
    // السماح بالاتصال المحلي غير المشفّر بأجهزة الميكروتك داخل الشبكة (http://192.168.x.x)
    cleartext: true,
    allowNavigation: [
      appHostname,
      "*.onrender.com",
      "*.supabase.co",
      "*.lovable.app",
    ],
  },
  android: {
    // مطلوب للاتصال المحلي المباشر بالميكروتك (HTTP داخل LAN) من WebView
    allowMixedContent: true,
    backgroundColor: "#009688",
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: false,
      backgroundColor: "#009688",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: true,
      spinnerColor: "#ffffff",
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      backgroundColor: "#009688",
      style: "LIGHT",
      overlaysWebView: true,
    },
  },
};

export default config;