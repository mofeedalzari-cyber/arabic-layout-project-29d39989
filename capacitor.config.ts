import type { CapacitorConfig } from "@capacitor/cli";
import { config as loadEnv } from "dotenv";

// تحميل متغيرات .env لأن Capacitor CLI لا يحمّلها تلقائياً
loadEnv();

const appUrl = process.env['VITE_APP_URL'] || "http://localhost:3000";
const appHostname = appUrl.startsWith("http") ? new URL(appUrl).hostname : appUrl;

const config: CapacitorConfig = {
  appId: "com.mofeed.karti",
  appName: "كرتي",
  webDir: ".output/public",
  server: {
    url: appUrl,
    androidScheme: "https",
    cleartext: false,
    // صفحة محلية تُعرض بدل الشاشة السوداء / خطأ الشبكة عند انقطاع الإنترنت
    errorPath: "offline.html",
    allowNavigation: [
      appHostname,
      "*.onrender.com",
      "*.supabase.co",
      "*.lovable.app",
    ],
  },
  android: {
    allowMixedContent: false,
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
    App: {
      launchUrl: appUrl,
    },
  },
};

export default config;