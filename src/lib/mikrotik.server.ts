// Server-only helpers: اتصال RouterOS Binary API (منفذ 8728/8729) عبر node-routeros.
// يعمل مع RouterOS v6 و v7، ويتصل من السيرفر مباشرة (لا يحتاج المستخدم لنفس الشبكة).
// لا يُستدعى هذا الملف من المتصفح — تُستخدم دواله داخل createServerFn فقط.

export type MtCreds = {
  host: string;
  port: number;
  username: string;
  password: string;
  use_ssl: boolean;
};

type RouterOSClient = {
  connect: () => Promise<unknown>;
  write: (path: string, args?: string[]) => Promise<Array<Record<string, string>>>;
  close: () => void;
};

async function createClient(creds: MtCreds): Promise<RouterOSClient> {
  const mod = (await import("node-routeros")) as unknown as {
    RouterOSAPI?: new (opts: Record<string, unknown>) => RouterOSClient;
    default?: { RouterOSAPI?: new (opts: Record<string, unknown>) => RouterOSClient };
  };
  const RouterOSAPI = mod.RouterOSAPI ?? mod.default?.RouterOSAPI;
  if (!RouterOSAPI) throw new Error("تعذّر تحميل مكتبة الاتصال بالميكروتيك");
  return new RouterOSAPI({
    host: creds.host,
    user: creds.username,
    password: creds.password,
    port: creds.port || 8728,
    timeout: 10,
    tls: creds.use_ssl ? { rejectUnauthorized: false } : false,
  });
}

/** عناوين الشبكات الخاصة التي لا يمكن لسيرفر سحابي الوصول إليها */
const PRIVATE_HOST_RE =
  /^(localhost|0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|::1$|fc|fd)/i;

/**
 * السيرفر يعمل في استضافة سحابية — لا يمكنه الوصول لعناوين LAN الخاصة.
 * نرفض مبكراً برسالة واضحة بدل انتظار مهلة الاتصال 10 ثوانٍ.
 */
function assertPubliclyReachable(host: string) {
  const h = host.trim().toLowerCase();
  if (PRIVATE_HOST_RE.test(h)) {
    throw new Error(
      `العنوان "${host}" خاص بشبكة محلية (LAN) — السيرفر السحابي لا يستطيع الوصول إليه. ` +
        "استخدم IP عاماً للراوتر مع فتح منفذ API (Port Forward)، أو VPN، أو Cloudflare Tunnel.",
    );
  }
}

/** رسائل خطأ عربية واضحة لأعطال الاتصال الشائعة */
export function friendlyMtError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const m = raw.toLowerCase();
  if (m.includes("not implemented") || m.includes("unenv") || m.includes("is not a function"))
    return "اتصال Binary API (TCP خام) غير مدعوم في بيئة الاستضافة الحالية — انشر التطبيق على Render حيث يعمل Node.js.";
  if (m.includes("timeout") || m.includes("timed out") || m.includes("etimedout"))
    return "انتهت مهلة الاتصال — تأكد من العنوان والمنفذ وأن المنفذ مفتوح على الراوتر (Port Forward).";
  if (m.includes("econnrefused") || m.includes("refused"))
    return "الراوتر رفض الاتصال — تأكد من تفعيل خدمة api/api-ssl في IP → Services ومن صحة المنفذ.";
  if (m.includes("ehostunreach") || m.includes("enetunreach") || m.includes("unreachable"))
    return "تعذّر الوصول للجهاز — تحقق من العنوان والشبكة.";
  if (m.includes("cannot log in") || m.includes("login") || m.includes("auth") || m.includes("password"))
    return "بيانات الدخول غير صحيحة — تحقق من اسم المستخدم وكلمة المرور.";
  if (m.includes("ssl") || m.includes("tls") || m.includes("certificate"))
    return "خطأ في الاتصال المشفّر — جرّب تعطيل API-SSL أو تفعيله بشكل صحيح.";
  return `فشل الاتصال بالميكروتيك: ${raw}`;
}

/** يتصل بالراوتر، ينفّذ الدالة، ثم يغلق الاتصال دائماً */
export async function withRouter<T>(
  creds: MtCreds,
  fn: (api: RouterOSClient) => Promise<T>,
): Promise<T> {
  assertPubliclyReachable(creds.host);
  const api = await createClient(creds);
  try {
    await api.connect();
  } catch (e) {
    try {
      api.close();
    } catch {
      /* ignore */
    }
    throw new Error(friendlyMtError(e));
  }
  try {
    return await fn(api);
  } catch (e) {
    throw new Error(friendlyMtError(e));
  } finally {
    try {
      api.close();
    } catch {
      /* ignore */
    }
  }
}

type SupabaseLike = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        val: string,
      ) => {
        single: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
      };
    };
  };
};

/** يجيب بيانات الجهاز من قاعدة البيانات (RLS تقيّد الوصول لصاحب الشبكة تلقائياً) */
export async function getDeviceCreds(supabase: unknown, mikrotikId: string): Promise<MtCreds> {
  const { data, error } = await (supabase as SupabaseLike)
    .from("mikrotiks")
    .select("host, port, username, password, use_https")
    .eq("id", mikrotikId)
    .single();
  if (error || !data) throw new Error("الجهاز غير موجود أو لا تملك صلاحية الوصول إليه");
  return {
    host: String(data.host ?? ""),
    port: Number(data.port ?? 8728) || 8728,
    username: String(data.username ?? ""),
    password: String(data.password ?? ""),
    use_ssl: Boolean(data.use_https),
  };
}
