// إنشاء مستخدم هوت سبوت مباشرة في الميكروتك لحظة البيع (بدون كروت مُحمّلة مسبقاً).
// يتم الاتصال من جهاز البائع نفسه لأن الراوتر داخل الشبكة المحلية.

export type HotspotRouter = {
  id: string;
  name: string;
  host: string;
  port: number | null;
  use_https: boolean;
  username: string;
  password: string;
};

const AMBIGUOUS = /[0OoIl1]/g;
const LETTERS = "abcdefghjkmnpqrstuvwxyz";
const DIGITS = "23456789";

function pick(pool: string, n: number) {
  const arr = new Uint32Array(n);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(arr);
  else for (let i = 0; i < n; i++) arr[i] = Math.floor(Math.random() * 1e9);
  let out = "";
  for (let i = 0; i < n; i++) out += pool[arr[i] % pool.length];
  return out;
}

/** اسم مستخدم/كلمة سر واضحة بدون حروف متشابهة */
export function generateCredentials(prefix?: string) {
  const clean = (prefix ?? "").replace(/[^a-zA-Z0-9]/g, "").replace(AMBIGUOUS, "").slice(0, 4);
  const username = `${clean ? clean.toLowerCase() + "-" : ""}${pick(LETTERS, 3)}${pick(DIGITS, 4)}`;
  const password = `${pick(DIGITS, 3)}${pick(LETTERS, 2)}${pick(DIGITS, 3)}`;
  return { username, password };
}

function baseUrl(router: HotspotRouter) {
  const scheme = router.use_https ? "https" : "http";
  const port = router.port && router.port !== 80 && router.port !== 443 ? `:${router.port}` : "";
  return `${scheme}://${router.host}${port}/rest`;
}

async function req(router: HotspotRouter, path: string, init?: RequestInit) {
  const res = await fetch(`${baseUrl(router)}${path}`, {
    ...init,
    headers: {
      Authorization: "Basic " + btoa(`${router.username}:${router.password}`),
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`الراوتر رفض الطلب (${res.status}) ${text}`.trim());
  }
  const ct = res.headers.get("content-type") ?? "";
  return ct.includes("application/json") ? res.json() : null;
}

/** التحقق من إمكانية الوصول للراوتر قبل البيع */
export async function pingRouter(router: HotspotRouter) {
  await req(router, "/system/resource");
}

/** إنشاء مستخدم هوت سبوت جديد */
export async function createHotspotUser(
  router: HotspotRouter,
  opts: { username: string; password: string; profile?: string; comment?: string },
) {
  await req(router, "/ip/hotspot/user/add", {
    method: "POST",
    body: JSON.stringify({
      name: opts.username,
      password: opts.password,
      profile: opts.profile?.trim() || "default",
      comment: opts.comment ?? "karti",
    }),
  });
}

/** حذف المستخدم في حال فشل تسجيل المبيعة (تراجُع) */
export async function removeHotspotUser(router: HotspotRouter, username: string) {
  try {
    const list = (await req(router, "/ip/hotspot/user")) as Array<Record<string, string>> | null;
    const found = (list ?? []).find((u) => u.name === username);
    const id = found?.[".id"];
    if (id) await req(router, `/ip/hotspot/user/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch {
    /* تجاهل */
  }
}
