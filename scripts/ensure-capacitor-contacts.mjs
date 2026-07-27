import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const androidRoot = join(process.cwd(), "android");
const manifestPath = join(androidRoot, "app", "src", "main", "AndroidManifest.xml");
const javaRoot = join(androidRoot, "app", "src", "main", "java");

function read(path) {
  return readFileSync(path, "utf8");
}

function write(path, content) {
  writeFileSync(path, content, "utf8");
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function ensureManifestPermissions() {
  if (!existsSync(manifestPath)) {
    console.log("لم يتم العثور على AndroidManifest.xml — تخطيت أذونات جهات الاتصال.");
    return;
  }

  let manifest = read(manifestPath);
  const permissions = [
    '<uses-permission android:name="android.permission.READ_CONTACTS" />',
    '<uses-permission android:name="android.permission.WRITE_CONTACTS" />',
  ];
  const missing = permissions.filter((permission) => !manifest.includes(permission));
  if (missing.length === 0) {
    console.log("أذونات جهات الاتصال موجودة مسبقاً.");
    return;
  }

  manifest = manifest.replace(/<application\b/, `${missing.join("\n    ")}\n\n    <application`);
  write(manifestPath, manifest);
  console.log("تمت إضافة أذونات جهات الاتصال إلى AndroidManifest.xml.");
}

function addJavaImport(source, importLine) {
  if (source.includes(importLine)) return source;
  const packageMatch = source.match(/^package\s+[^;]+;\s*/m);
  if (packageMatch) {
    const index = packageMatch.index + packageMatch[0].length;
    return `${source.slice(0, index)}\n${importLine}\n${source.slice(index)}`;
  }
  return `${importLine}\n${source}`;
}

function ensureJavaMainActivity(path) {
  let source = read(path);
  if (source.includes("registerPlugin(ContactsPlugin.class)")) {
    console.log("ContactsPlugin مسجل مسبقاً في MainActivity.java.");
    return;
  }

  source = addJavaImport(source, "import android.os.Bundle;");
  source = addJavaImport(source, "import getcapacitor.community.contacts.ContactsPlugin;");

  if (/class\s+MainActivity\s+extends\s+BridgeActivity\s*\{\s*\}/s.test(source)) {
    source = source.replace(
      /class\s+MainActivity\s+extends\s+BridgeActivity\s*\{\s*\}/s,
      `class MainActivity extends BridgeActivity {\n    @Override\n    public void onCreate(Bundle savedInstanceState) {\n        registerPlugin(ContactsPlugin.class);\n        super.onCreate(savedInstanceState);\n    }\n}`,
    );
  } else if (/super\.onCreate\(savedInstanceState\);/.test(source)) {
    source = source.replace(/super\.onCreate\(savedInstanceState\);/, "registerPlugin(ContactsPlugin.class);\n        super.onCreate(savedInstanceState);");
  } else {
    source = source.replace(
      /(class\s+MainActivity\s+extends\s+BridgeActivity\s*\{)/,
      `$1\n    @Override\n    public void onCreate(Bundle savedInstanceState) {\n        registerPlugin(ContactsPlugin.class);\n        super.onCreate(savedInstanceState);\n    }\n`,
    );
  }

  write(path, source);
  console.log("تم تسجيل ContactsPlugin في MainActivity.java.");
}

function addKotlinImport(source, importLine) {
  if (source.includes(importLine)) return source;
  const packageMatch = source.match(/^package\s+[^\n]+\s*/m);
  if (packageMatch) {
    const index = packageMatch.index + packageMatch[0].length;
    return `${source.slice(0, index)}\n${importLine}\n${source.slice(index)}`;
  }
  return `${importLine}\n${source}`;
}

function ensureKotlinMainActivity(path) {
  let source = read(path);
  if (source.includes("registerPlugin(ContactsPlugin::class.java)")) {
    console.log("ContactsPlugin مسجل مسبقاً في MainActivity.kt.");
    return;
  }

  source = addKotlinImport(source, "import android.os.Bundle");
  source = addKotlinImport(source, "import getcapacitor.community.contacts.ContactsPlugin");

  if (/class\s+MainActivity\s*:\s*BridgeActivity\(\)\s*\{\s*\}/s.test(source)) {
    source = source.replace(
      /class\s+MainActivity\s*:\s*BridgeActivity\(\)\s*\{\s*\}/s,
      `class MainActivity : BridgeActivity() {\n    override fun onCreate(savedInstanceState: Bundle?) {\n        registerPlugin(ContactsPlugin::class.java)\n        super.onCreate(savedInstanceState)\n    }\n}`,
    );
  } else if (/super\.onCreate\(savedInstanceState\)/.test(source)) {
    source = source.replace(/super\.onCreate\(savedInstanceState\)/, "registerPlugin(ContactsPlugin::class.java)\n        super.onCreate(savedInstanceState)");
  } else {
    source = source.replace(
      /(class\s+MainActivity\s*:\s*BridgeActivity\(\)\s*\{)/,
      `$1\n    override fun onCreate(savedInstanceState: Bundle?) {\n        registerPlugin(ContactsPlugin::class.java)\n        super.onCreate(savedInstanceState)\n    }\n`,
    );
  }

  write(path, source);
  console.log("تم تسجيل ContactsPlugin في MainActivity.kt.");
}

function ensureMainActivityRegistration() {
  const mainActivity = walk(javaRoot).find((file) => /MainActivity\.(java|kt)$/.test(file));
  if (!mainActivity) {
    console.log("لم يتم العثور على MainActivity — تخطيت التسجيل اليدوي لإضافة جهات الاتصال.");
    return;
  }

  if (mainActivity.endsWith(".java")) {
    ensureJavaMainActivity(mainActivity);
  } else {
    ensureKotlinMainActivity(mainActivity);
  }
}

if (!existsSync(androidRoot)) {
  console.log("مجلد android غير موجود. شغّل npx cap add android أولاً.");
  process.exit(0);
}

ensureManifestPermissions();
ensureMainActivityRegistration();
console.log("اكتمل تجهيز إضافة جهات الاتصال لأندرويد.");