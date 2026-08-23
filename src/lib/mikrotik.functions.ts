import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getDeviceCreds, withRouter, friendlyMtError, type MtCreds } from "./mikrotik.server";

const idInput = (data: unknown) => z.object({ mikrotikId: z.string().uuid() }).parse(data);

export const mtGetOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idInput)
  .handler(async ({ data, context }) => {
    const creds = await getDeviceCreds(context.supabase, data.mikrotikId);
    return withRouter(creds, async (api) => {
      const [resource, identity] = await Promise.all([
        api.write("/system/resource/print"),
        api.write("/system/identity/print"),
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
    });
  });

export const mtGetActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idInput)
  .handler(async ({ data, context }) => {
    const creds = await getDeviceCreds(context.supabase, data.mikrotikId);
    return withRouter(creds, (api) => api.write("/ip/hotspot/active/print"));
  });

export const mtKickActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ mikrotikId: z.string().uuid(), activeId: z.string().min(1).max(64) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const creds = await getDeviceCreds(context.supabase, data.mikrotikId);
    return withRouter(creds, async (api) => {
      await api.write("/ip/hotspot/active/remove", [`=.id=${data.activeId}`]);
      return { ok: true };
    });
  });

export const mtGetUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idInput)
  .handler(async ({ data, context }) => {
    const creds = await getDeviceCreds(context.supabase, data.mikrotikId);
    return withRouter(creds, (api) => api.write("/ip/hotspot/user/print"));
  });

export const mtAddUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        mikrotikId: z.string().uuid(),
        name: z.string().min(1).max(64),
        password: z.string().max(64).optional(),
        profile: z.string().max(64).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const creds = await getDeviceCreds(context.supabase, data.mikrotikId);
    return withRouter(creds, async (api) => {
      await api.write("/ip/hotspot/user/add", [
        `=name=${data.name}`,
        `=password=${data.password ?? ""}`,
        `=profile=${data.profile?.trim() || "default"}`,
        "=comment=karti",
      ]);
      return { ok: true };
    });
  });

export const mtDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ mikrotikId: z.string().uuid(), userId: z.string().min(1).max(64) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const creds = await getDeviceCreds(context.supabase, data.mikrotikId);
    return withRouter(creds, async (api) => {
      await api.write("/ip/hotspot/user/remove", [`=.id=${data.userId}`]);
      return { ok: true };
    });
  });

export const mtGetProfiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idInput)
  .handler(async ({ data, context }) => {
    const creds = await getDeviceCreds(context.supabase, data.mikrotikId);
    return withRouter(creds, (api) => api.write("/ip/hotspot/user/profile/print"));
  });

export const mtAddProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        mikrotikId: z.string().uuid(),
        name: z.string().min(1).max(64),
        rateLimit: z.string().max(64).optional(),
        sessionTimeout: z.string().max(64).optional(),
        sharedUsers: z.string().max(8).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const creds = await getDeviceCreds(context.supabase, data.mikrotikId);
    return withRouter(creds, async (api) => {
      const args = [`=name=${data.name}`];
      if (data.rateLimit) args.push(`=rate-limit=${data.rateLimit}`);
      if (data.sessionTimeout) args.push(`=session-timeout=${data.sessionTimeout}`);
      if (data.sharedUsers) args.push(`=shared-users=${data.sharedUsers}`);
      await api.write("/ip/hotspot/user/profile/add", args);
      return { ok: true };
    });
  });

export const mtDeleteProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ mikrotikId: z.string().uuid(), profileId: z.string().min(1).max(64) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const creds = await getDeviceCreds(context.supabase, data.mikrotikId);
    return withRouter(creds, async (api) => {
      await api.write("/ip/hotspot/user/profile/remove", [`=.id=${data.profileId}`]);
      return { ok: true };
    });
  });

/**
 * اختبار الاتصال بجهاز جديد قبل الحفظ.
 * إذا تم تمرير mikrotikId وكانت كلمة المرور فارغة تُستخدم كلمة المرور المخزّنة.
 * لا تُعيد كلمة المرور أبداً — فقط نتيجة الاختبار.
 */
export const mtTestConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        mikrotikId: z.string().uuid().optional(),
        host: z.string().min(1).max(255),
        port: z.number().int().min(1).max(65535),
        username: z.string().min(1).max(64),
        password: z.string().max(128).optional(),
        use_ssl: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    let creds: MtCreds = {
      host: data.host.trim(),
      port: data.port || 8728,
      username: data.username.trim(),
      password: data.password ?? "",
      use_ssl: data.use_ssl ?? false,
    };
    if (data.mikrotikId && !creds.password) {
      const stored = await getDeviceCreds(context.supabase, data.mikrotikId);
      creds = { ...creds, password: stored.password };
    }
    try {
      return await withRouter(creds, async (api) => {
        const identity = await api.write("/system/identity/print");
        const resource = await api.write("/system/resource/print");
        return {
          ok: true as const,
          identity: identity?.[0]?.name ?? "",
          version: resource?.[0]?.version ?? "",
        };
      });
    } catch (e) {
      return { ok: false as const, error: friendlyMtError(e) };
    }
  });
