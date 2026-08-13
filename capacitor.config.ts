import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.mofeed.karti",
  appName: "كرتي",
  // The APK must always have a local document to boot from. Pointing `server.url`
  // at Render makes Android show its own ERR_FAILED page before our app can recover.
  webDir: "www",
  server: {
    androidScheme: "https",
    cleartext: false,
    errorPath: "offline.html",
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
  },
};

export default config;