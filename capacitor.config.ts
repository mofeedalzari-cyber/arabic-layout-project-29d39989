import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.mofeed.karti", // ← غيرت المعرف
  appName: "كرتي", // ← غيرت اسم التطبيق
  webDir: ".output/public", // ← غيرت من "www" إلى ".output/public"
  server: {
    url: "https://arabic-layout-project.onrender.com", // 🔑 يبقى كما هو
    androidScheme: "https",
    cleartext: false,
    allowNavigation: [
      "arabic-layout-project.onrender.com",
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
      launchUrl: "https://arabic-layout-project.onrender.com", // 🔑 يبقى كما هو
    },
  },
};

export default config;