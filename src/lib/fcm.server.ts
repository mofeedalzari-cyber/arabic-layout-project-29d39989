// Firebase Cloud Messaging (HTTP v1) sender — server-only.
// Requires the FIREBASE_SERVICE_ACCOUNT secret (the full service-account JSON).

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

export type FcmResult = {
  sent: number;
  failed: number;
  skipped?: string;
  /** عدد الرموز المحذوفة من قاعدة البيانات لأنها لم تعد صالحة */
  staleDeleted?: number;
  /** أول رسالة خطأ أعادها Firebase (لمعرفة السبب الحقيقي عند الفشل) */
  error?: string;
};

function b64url(input: ArrayBuffer | string): string {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

function readServiceAccount(): ServiceAccount | null {
  const raw = process.env["FIREBASE_SERVICE_ACCOUNT"];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ServiceAccount;
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * هل هذا الخطأ يعني أن رمز الجهاز لم يعد صالحًا؟
 * Delete only an explicit UNREGISTERED error, never a generic 400/404.
 * Invalid payloads and missing projects do not prove the device token is stale.
 */
export function isStaleFcmError(status: number, body: string): boolean {
  if (status !== 404 && status !== 400) return false;
  try {
    const parsed = JSON.parse(body) as { error?: { status?: string; details?: { errorCode?: string; "@type"?: string }[] } };
    return parsed.error?.status === "UNREGISTERED" || !!parsed.error?.details?.some(
      (detail) => detail["@type"] === "type.googleapis.com/google.firebase.fcm.v1.FcmError" && detail.errorCode === "UNREGISTERED",
    );
  } catch { return false; }
}

export function getFcmProjectId(): string | null {
  return readServiceAccount()?.project_id ?? null;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${claims}`),
  );
  const assertion = `${header}.${claims}.${b64url(signature)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`FCM auth failed (${res.status})`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

async function deleteStaleTokens(tokens: string[]): Promise<number> {
  if (tokens.length === 0) return 0;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("device_tokens").delete().in("token", tokens);
    if (error) return 0;
    return tokens.length;
  } catch {
    return 0;
  }
}

export async function sendFcmToTokens(
  tokens: string[],
  payload: { title: string; body: string; path?: string; tag?: string },
  options: { validateOnly?: boolean } = {},
): Promise<FcmResult> {
  const unique = Array.from(new Set(tokens.filter(Boolean)));
  if (unique.length === 0) return { sent: 0, failed: 0, skipped: "no-tokens" };

  const sa = readServiceAccount();
  if (!sa) return { sent: 0, failed: 0, skipped: "not-configured" };

  let accessToken: string;
  try {
    accessToken = await getAccessToken(sa);
  } catch (error) {
    return {
      sent: 0,
      failed: unique.length,
      error: error instanceof Error ? error.message : "تعذّر التحقق من حساب Firebase",
    };
  }

  const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

  let sent = 0;
  let failed = 0;
  let firstError = "";
  const stale: string[] = [];

  await Promise.all(
    unique.map(async (token) => {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            ...(options.validateOnly ? { validate_only: true } : {}),
            message: {
              token,
              notification: { title: payload.title, body: payload.body },
              data: {
                path: payload.path ?? "/app",
                tag: payload.tag ?? "karti",
                body: payload.body,
                title: payload.title,
              },
              android: {
                priority: "HIGH",
                notification: {
                  channel_id: "karti_requests",
                  sound: "default",
                  default_vibrate_timings: true,
                  notification_priority: "PRIORITY_MAX",
                  // نقطة/عدّاد على أيقونة التطبيق في الشاشة الرئيسية
                  notification_count: 1,
                },
              },
              apns: { payload: { aps: { badge: 1, sound: "default" } } },
            },
          }),
        });

        if (res.ok) {
          sent++;
          return;
        }

        const body = await res.text().catch(() => "");
        failed++;
        if (isStaleFcmError(res.status, body)) stale.push(token);
        else if (!firstError) firstError = `Firebase [${res.status}] ${body.replaceAll(token, "[redacted]").slice(0, 300)}`;
      } catch (error) {
        failed++;
        if (!firstError) firstError = error instanceof Error ? error.message : "فشل الإرسال";
      }
    }),
  );

  const staleDeleted = options.validateOnly ? 0 : await deleteStaleTokens(stale);

  return {
    sent,
    failed,
    ...(staleDeleted ? { staleDeleted } : {}),
    ...(firstError ? { error: firstError } : {}),
  };
}
