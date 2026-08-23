// اتصال محلي مباشر بالميكروتك من جهاز المستخدم عبر RouterOS REST API (يتطلب v7+).
// يُستخدم عندما يكون الجوال على نفس شبكة الواي فاي للراوتر — بدون سيرفر وبدون IP عام.
// في تطبيق أندرويد (Capacitor) تتم الطلبات natively فتتجاوز قيود CORS و Mixed Content.
import { CapacitorHttp } from "@capacitor/core";

export type LocalRouter = {
  host: string;
  port: number | null;
  username: string;
  password: string;
  use_https: boolean;
};

export type MtLocalRow = Record<string, string>;

// منافذ RouterOS API الثنائي — في الوضع المحلي نستخدم منفذ خدمة www/www-ssl بدلاً منها
const API_PORTS = new Set([8728, 8729]);

function restPort(r: LocalRouter): number {
  if (!r.port || API_PORTS.has(r.port)) return r.use_https ? 443 : 80;
  return r.port;
}

function baseUrl(r: LocalRouter): string {
  const scheme = r.use_https ? "https" : "http";
  const p = restPort(r);
  const def = r.use_https ? 443 : 80;
  return `${scheme}://${r.host}${p === def ? "" : `:${p}`}/rest`;
}

function authHeader(r: LocalRouter): string {
  return "Basic " + btoa(`${r.username}:${r.password}`);
}

function friendlyLocalError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/HTTP 401/.test(msg)) return "اسم المستخدم أو كلمة المرور غير صحيحة.";
  if (/HTTP 403/.test(msg)) return "الراوتر رفض الوصول — تحقق من صلاحيات المستخدم في الميكروتيك.";
  if (/HTTP 404/.test(msg))
    return "المسار غير موجود — تأكد أن الراوتر RouterOS v7 أو أحدث وأن خدمة www مفعّلة.";
  const httpMatch = msg.match(/HTTP (\d+)/);
  if (httpMatch) return `الراوتر رفض الطلب (رمز ${httpMatch[1]}).`;
  if (/failed to fetch|networkerror|network request failed|unreachable|timed?\s*out|abort|refused|reset/i.test(msg))
    return "تعذّر الوصول للراوتر — تأكد أن جوالك متصل بنفس شبكة الواي فاي، وأن خدمة www مفعّلة (/ip service enable www)، وأن العنوان صحيح.";
  if (/certificate|ssl|tls|handshake/i.test(msg))
    return "مشكلة في شهادة SSL — عطّل خيار التشفير (استخدم HTTP) للاتصال المحلي.";
  return msg || "خطأ غير معروف أثناء الاتصال المحلي.";
}

async function request<T = unknown>(
  r: LocalRouter,
  method: "GET" | "PUT" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const url = `${baseUrl(r)}${path}`;
  try {
    const res = await CapacitorHttp.request({
      method,
      url,
      headers: {
        Authorization: authHeader(r),
        "Content-Type": "application/json",
      },
      data: body,
      connectTimeout: 8000,
      readTimeout: 12000,
    });
    if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`);
    return res.data as T;
  } catch (e) {
    throw new Error(friendlyLocalError(e));
  }
}

/** اختبار الاتصال المحلي — يجلب اسم الجهاز وإصدار RouterOS */
export async function mtLocalTest(
  r: LocalRouter,
): Promise<{ ok: true; identity: string; version: string } | { ok: false; error: string }> {
  try {
    const [resource, identity] = await Promise.all([
      request<MtLocalRow[]>(r, "GET", "/system/resource"),
      request<MtLocalRow[]>(r, "GET", "/system/identity"),
    ]);
    return {
      ok: true,
      identity: identity?.[0]?.name ?? "",
      version: resource?.[0]?.version ?? "",
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** نظرة عامة: الموارد + اسم الجهاز */
export async function mtLocalOverview(r: LocalRouter) {
  const [resource, identity] = await Promise.all([
    request<MtLocalRow[]>(r, "GET", "/system/resource"),
    request<MtLocalRow[]>(r, "GET", "/system/identity"),
  ]);
  const res = resource?.[0] ?? {};
  const idn = identity?.[0] ?? {};
  return {
    identity: idn.name,
    version: res.version,
    boardName: res["board-name"],
    uptime: res.uptime,
    cpuLoad: res["cpu-load"],
    freeMemory: res["free-memory"],
    totalMemory: res["total-memory"],
  };
}

export function mtLocalActive(r: LocalRouter) {
  return request<MtLocalRow[]>(r, "GET", "/ip/hotspot/active");
}

export function mtLocalKickActive(r: LocalRouter, activeId: string) {
  return request(r, "DELETE", `/ip/hotspot/active/${encodeURIComponent(activeId)}`);
}

export function mtLocalUsers(r: LocalRouter) {
  return request<MtLocalRow[]>(r, "GET", "/ip/hotspot/user");
}

export function mtLocalAddUser(
  r: LocalRouter,
  u: { name: string; password?: string; profile?: string },
) {
  return request(r, "PUT", "/ip/hotspot/user", {
    name: u.name,
    password: u.password ?? "",
    profile: u.profile?.trim() || "default",
    comment: "karti",
  });
}

export function mtLocalDeleteUser(r: LocalRouter, userId: string) {
  return request(r, "DELETE", `/ip/hotspot/user/${encodeURIComponent(userId)}`);
}

export function mtLocalProfiles(r: LocalRouter) {
  return request<MtLocalRow[]>(r, "GET", "/ip/hotspot/user/profile");
}

export function mtLocalAddProfile(
  r: LocalRouter,
  p: { name: string; rateLimit?: string; sessionTimeout?: string; sharedUsers?: string },
) {
  const body: Record<string, unknown> = { name: p.name };
  if (p.rateLimit) body["rate-limit"] = p.rateLimit;
  if (p.sessionTimeout) body["session-timeout"] = p.sessionTimeout;
  if (p.sharedUsers) body["shared-users"] = p.sharedUsers;
  return request(r, "PUT", "/ip/hotspot/user/profile", body);
}

export function mtLocalDeleteProfile(r: LocalRouter, profileId: string) {
  return request(r, "DELETE", `/ip/hotspot/user/profile/${encodeURIComponent(profileId)}`);
}
