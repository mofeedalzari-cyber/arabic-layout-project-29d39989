// T setup-android-firebase.mjs
// يجهّز مشروع Android لإشعارات Firebase (FCM) بعد كل `npx cap add android`.
//
// لماذا هذا الملف؟
//   build-android.ps1 يحذف مجلد android/ ويعيد إنشاءه من الصفر في كل بناء.
//   لذلك أي google-services.json أو إذن يُضاف يدويًا داخل android/ يضيع،
//   وتفشل الإشعارات برسالة "Firebase not initialized" قبل PushNotifications.register().
//
// ما يفعله:
//   1) ينسخ resources/firebase/google-services.json إلى android/app/
//   2) يتأكد أن الحزمة (applicationId) مطابقة لملف Firebase
//   3) يفعّل إضافة google-services في build.gradle (الجذر + التطبيق)
//   4) يضيف إذن POST_NOTIFICATIONS وقناة الإشعارات الافتراضية إلى AndroidManifest
//   5) يعيد إضافة روابط App Links بنفس رابط الإنتاج الحالي
//
// الاستخدام: node scripts/setup-android-firebase.mjs
//   (يُنفَّذ تلقائيًا من build-android.ps1 بعد npx cap add android)

import { existsSync, copyFileSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, "..");
const androidRoot = join(projectRoot, "android");
const appDir = join(androidRoot, "app");
const manifestPath = join(appDir, "src", "main", "AndroidManifest.xml");
const appGradlePath = join(appDir, "build.gradle");
const rootGradlePath = join(androidRoot, "build.gradle");
const firebaseSource = join(projectRoot, "resources", "firebase", "google-services.json");
const firebaseTarget = join(appDir, "google-services.json");

const NOTIFICATION_CHANNEL = "karti_requests";
const GOOGLE_SERVICES_PLUGIN = "com.google.gms.google-services";
const GOOGLE_SERVICES_VERSION = "4.4.2";

function read(path) {
  return readFileSync(path, "utf8");
}

function write(path, content) {
  writeFileSync(path, content, "utf8");
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function note(message) {
  console.log(`• ${message}`);
}

function ok(message) {
  console.log(`✓ ${message}`);
}

// ---------------------------------------------------------------- google-services.json

function readCapacitorAppUrl() {
  // رابط الإنتاج من capacitor.config.ts حتى تتطابق روابط App Links معه.
  const configPath = join(projectRoot, "capacitor.config.ts");
  if (!existsSync(configPath)) return "";
  const source = read(configPath);
  const match = source.match(/PRODUCTION_APP_URL\s*=\s*["']([^"']+)["']/);
  return match?.[1]?.trim() ?? "";
}

function loadFirebaseConfig() {
  if (!existsSync(firebaseSource)) {
    fail(
      `لم أجد ${firebaseSource}\n` +
        "  حمّل google-services.json من Firebase Console:\n" +
        "  Project settings → Your apps → (Android app com.mofeed.karti) → google-services.json\n" +
        "  ثم ضعه في resources/firebase/google-services.json وأعد تشغيل البناء.",
    );
  }

  let config;
  try {
    config = JSON.parse(read(firebaseSource));
  } catch {
    fail("ملف resources/firebase/google-services.json غير صالح (ليس JSON مقروءًا).");
  }

  const projectId = config?.project_info?.project_id;
  const client = (config?.client ?? []).find((c) => c?.android_client_info?.package_name);
  if (!projectId || !client) {
    fail("ملف google-services.json ناقص: لا يحتوي project_info.project_id أو عميل Android.");
  }

  const appId = client.client_info?.mobilesdk_app_id;
  if (!appId) fail("ملف google-services.json ناقص: لا يحتوي mobilesdk_app_id لعميل Android.");

  return { projectId, packageName: client.android_client_info.package_name, appId };
}

function installGoogleServicesJson(config) {
  mkdirSync(dirname(firebaseTarget), { recursive: true });
  copyFileSync(firebaseSource, firebaseTarget);
  ok(`نُسخ google-services.json إلى android/app/ (مشروع: ${config.projectId})`);
}

// ---------------------------------------------------------------- package name check

function readApplicationId() {
  if (!existsSync(appGradlePath)) fail("لم أجد android/app/build.gradle — شغّل npx cap add android أولًا.");
  const source = read(appGradlePath);
  const match = source.match(/applicationId\s+["']([^"']+)["']/);
  return match?.[1] ?? "";
}

function checkPackageName(config) {
  const applicationId = readApplicationId();
  if (!applicationId) fail("لم أجد applicationId في android/app/build.gradle.");
  if (applicationId !== config.packageName) {
    fail(
      `اسم الحزمة غير مطابق:\n` +
        `  android/app/build.gradle → applicationId = ${applicationId}\n` +
        `  google-services.json     → package_name = ${config.packageName}\n` +
        "  أنشئ عميل Android في Firebase بنفس applicationId، أو عدّل applicationId ثم أعد البناء.",
    );
  }
  ok(`اسم الحزمة مطابق: ${applicationId}`);
}

// ---------------------------------------------------------------- gradle wiring

function ensureRootGradle() {
  if (!existsSync(rootGradlePath)) {
    note("لم أجد android/build.gradle — تخطيت فحص الجذر.");
    return;
  }
  let source = read(rootGradlePath);
  if (source.includes(GOOGLE_SERVICES_PLUGIN)) {
    ok("إضافة google-services مذكورة في build.gradle للجذر.");
    return;
  }

  if (/buildscript\s*\{[\s\S]*?dependencies\s*\{/.test(source)) {
    source = source.replace(
      /(buildscript\s*\{[\s\S]*?dependencies\s*\{)/,
      `$1\n\t\tclasspath 'com.google.gms:google-services:${GOOGLE_SERVICES_VERSION}'`,
    );
    write(rootGradlePath, source);
    ok("أُضيفت classpath الخاصة بـ google-services إلى build.gradle للجذر.");
    return;
  }

  if (/plugins\s*\{/.test(source)) {
    source = source.replace(
      /(plugins\s*\{)/,
      `$1\n\tid '${GOOGLE_SERVICES_PLUGIN}' version '${GOOGLE_SERVICES_VERSION}' apply false`,
    );
    write(rootGradlePath, source);
    ok("أُضيفت google-services إلى كتلة plugins في build.gradle للجذر.");
    return;
  }

  fail("لا أستطيع ربط google-services في android/build.gradle — البنية غير متوقعة.");
}

function ensureAppGradle() {
  let source = read(appGradlePath);
  if (!source.includes(`apply plugin: 'com.google.gms.google-services'`)) {
    source = `${source.trimEnd()}\n\napply plugin: 'com.google.gms.google-services'\n`;
    write(appGradlePath, source);
    ok("أُفعّلت إضافة google-services في android/app/build.gradle.");
  } else {
    ok("إضافة google-services مفعّلة في android/app/build.gradle.");
  }

  source = read(appGradlePath);
  if (/com\.google\.firebase:firebase-messaging/.test(source)) {
    ok("مكتبة firebase-messaging مذكورة في android/app/build.gradle.");
    return;
  }
  if (/dependencies\s*\{/.test(source)) {
    source = source.replace(
      /(dependencies\s*\{)/,
      `$1\n    implementation 'com.google.firebase:firebase-messaging:24.10.1'`,
    );
    write(appGradlePath, source);
    ok("أُضيفت مكتبة firebase-messaging إلى android/app/build.gradle.");
  }
}

// ---------------------------------------------------------------- manifest

function ensureManifest(config, appUrl) {
  if (!existsSync(manifestPath)) fail("لم أجد android/app/src/main/AndroidManifest.xml.");

  let manifest = read(manifestPath);
  const before = manifest;

  const permission = '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />';
  if (!manifest.includes("android.permission.POST_NOTIFICATIONS")) {
    manifest = manifest.replace(/<application\b/, `${permission}\n\n    <application`);
    ok("أُضيف إذن POST_NOTIFICATIONS إلى AndroidManifest.xml.");
  } else {
    ok("إذن POST_NOTIFICATIONS موجود مسبقًا.");
  }

  const channelMeta = `<meta-data android:name="com.google.firebase.messaging.default_notification_channel_id" android:value="${NOTIFICATION_CHANNEL}" />`;
  if (!manifest.includes("com.google.firebase.messaging.default_notification_channel_id")) {
    manifest = manifest.replace(/<application\b[^>]*>/, (tag) => `${tag}\n        ${channelMeta}`);
    ok(`أُضيفت قناة الإشعارات الافتراضية "${NOTIFICATION_CHANNEL}" إلى AndroidManifest.xml.`);
  } else {
    ok("قناة الإشعارات الافتراضية مضبوطة مسبقًا.");
  }

  const host = appUrl ? new URL(appUrl).hostname : "";
  if (host && !manifest.includes(`android:host="${host}"`)) {
    const appLinks =
      `<!-- App Links: ${appUrl} -->\n` +
      `            <intent-filter android:autoVerify="true">\n` +
      `                <action android:name="android.intent.action.VIEW" />\n` +
      `                <category android:name="android.intent.category.DEFAULT" />\n` +
      `                <category android:name="android.intent.category.BROWSABLE" />\n` +
      `                <data android:scheme="https" android:host="${host}" />\n` +
      `            </intent-filter>`;
    if (/<activity[\s\S]*?<\/activity>/.test(manifest)) {
      manifest = manifest.replace(/(<activity[\s\S]*?)(<\/activity>)/, (_m, head, tail) =>
        head.includes("android.intent.action.VIEW") ? `${head}${appLinks}\n            ${tail}` : `${head}${appLinks}\n            ${tail}`,
      );
      ok(`أُضيفت روابط App Links للمضيف ${host}.`);
    }
  } else if (host) {
    ok(`روابط App Links للمضيف ${host} موجودة مسبقًا.`);
  }

  if (manifest !== before) write(manifestPath, manifest);
}

// ---------------------------------------------------------------- run

function main() {
  if (!existsSync(androidRoot)) {
    console.log("مجلد android غير موجود. شغّل npx cap add android أولًا.");
    process.exit(0);
  }

  const config = loadFirebaseConfig();
  installGoogleServicesJson(config);
  checkPackageName(config);
  ensureRootGradle();
  ensureAppGradle();
  ensureManifest(config, readCapacitorAppUrl());

  console.log("اكتمل تجهيز Firebase لإشعارات Android.");
}

main();
