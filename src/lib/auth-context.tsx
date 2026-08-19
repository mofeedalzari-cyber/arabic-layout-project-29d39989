import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { ensureAuthStorageReady, clearNativeAuthStorage } from "@/lib/auth-persistence";

export type Role = "admin" | "agent" | "superadmin" | "user";

export interface Profile {
  id: string;
  username: string;
  full_name: string | null;
  phone: string | null;
  is_active: boolean;
  network_id: string | null;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: Role | null;
  isSuperadmin: boolean;
  loading: boolean;
  profileError: string | null;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ذاكرة محلية لبيانات الحساب حتى يفتح التطبيق بدون إنترنت
const ACCOUNT_CACHE_PREFIX = "app.account.v1.";
type CachedAccount = { profile: Profile; role: Role | null; isSuperadmin: boolean };

const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

function readAccountCache(uid: string): CachedAccount | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ACCOUNT_CACHE_PREFIX + uid);
    return raw ? (JSON.parse(raw) as CachedAccount) : null;
  } catch {
    return null;
  }
}

function writeAccountCache(uid: string, account: CachedAccount) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACCOUNT_CACHE_PREFIX + uid, JSON.stringify(account));
  } catch {
    /* ignore */
  }
}

// Convert username -> synthetic internal email
export const usernameToEmail = (u: string) =>
  `${u
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")}@wificards.local`;

export function AuthProvider({ children }: { children: ReactNode }) {
  const hydrationId = useRef(0);
  const hydratedToken = useRef<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  const loadProfileOnce = async (uid: string) => {
    const [{ data: prof, error: profErr }, { data: roles, error: rolesErr }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, username, full_name, phone, is_active, network_id")
        .eq("id", uid)
        .maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid),
    ]);
    if (profErr) throw profErr;
    if (rolesErr) throw rolesErr;
    // Right after sign-up the session token can reach PostgREST before the
    // signup trigger's rows are visible -> empty result with no error.
    // Treat that as retryable instead of rendering the "load failed" screen.
    if (!prof || !roles || roles.length === 0) {
      const e: any = new Error("PROFILE_NOT_READY");
      e.retryable = true;
      throw e;
    }
    const has = (name: string) => !!roles?.find((x) => x.role === name);
    // Effective role: prefer admin/agent so superadmin users get the same UI
    // as a network admin. isSuperadmin exposes the extra capability separately.
    const r = has("admin")
      ? "admin"
      : has("agent")
        ? "agent"
        : has("superadmin")
          ? "superadmin"
          : has("user")
            ? "user"
            : null;
    return {
      profile: prof as Profile,
      role: (r as Role | null) ?? null,
      isSuperadmin: has("superadmin"),
    };
  };

  // Retries transient failures (flaky mobile networks / cold start) instead of
  // silently leaving profile=null, which used to render an endless "loading" UI.
  const loadProfile = async (uid: string, attempts = 5) => {
    if (isOffline()) throw new Error("OFFLINE");
    let lastErr: unknown = null;
    for (let i = 0; i < attempts; i++) {
      try {
        return await loadProfileOnce(uid);
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, Math.min(600 * 2 ** i, 4000)));
      }
    }
    throw lastErr;
  };


  useEffect(() => {
    let mounted = true;

    const hydrateSession = async (nextSession: Session | null) => {
      const requestId = ++hydrationId.current;

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (!nextSession?.user) {
        hydratedToken.current = null;
        setProfile(null);
        setRole(null);
        setIsSuperadmin(false);
        setProfileError(null);
        if (mounted && requestId === hydrationId.current) setLoading(false);
        return;
      }

      // Keep the account gate in its loading state until both the profile and
      // role are available. Previously loading ended after getSession(), so the
      // app rendered the failure screen while these successful queries ran.
      const uid = nextSession.user.id;
      const cached = readAccountCache(uid);
      if (cached) {
        // نفتح التطبيق فوراً من البيانات المحفوظة (يعمل بدون إنترنت)
        setProfile(cached.profile);
        setRole(cached.role);
        setIsSuperadmin(cached.isSuperadmin);
        setProfileError(null);
        setLoading(false);
      } else {
        setLoading(true);
      }
      setProfileError(null);
      try {
        const account = await loadProfile(uid);
        if (!mounted || requestId !== hydrationId.current) return;
        setProfile(account.profile);
        setRole(account.role);
        setIsSuperadmin(account.isSuperadmin);
        setProfileError(null);
        writeAccountCache(uid, account);
        hydratedToken.current = nextSession.access_token;
      } catch (error) {
        if (!mounted || requestId !== hydrationId.current) return;
        console.error("[auth] profile hydration failed", error);
        // بدون إنترنت أو فشل مؤقت: نكمل بالبيانات المحفوظة بدون شاشة خطأ
        if (cached) {
          if (mounted && requestId === hydrationId.current) setLoading(false);
          return;
        }
        const message = error instanceof Error ? error.message : "";
        setProfileError(
          message && message !== "PROFILE_NOT_READY" && message !== "OFFLINE"
            ? message
            : "تعذر تحميل بيانات الحساب، أعد المحاولة.",
        );
      } finally {
        if (mounted && requestId === hydrationId.current) setLoading(false);
      }
    };

    let sub: { subscription: { unsubscribe: () => void } } | null = null;

    (async () => {
      try {
        // CRITICAL: restore the native-mirrored session into localStorage BEFORE
        // the Supabase client is ever touched, otherwise the very first read
        // happens against empty storage and the user looks signed out.
        await ensureAuthStorageReady();
      } catch {
        /* ignore */
      }
      if (!mounted) return;

      const res = supabase.auth.onAuthStateChange((event, s) => {
        if (!mounted) return;
        // getSession below owns the initial hydration. Refresh events keep the
        // same account data and must not start competing profile requests.
        if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") return;
        if (s?.access_token && s.access_token === hydratedToken.current) return;
        // Supabase advises deferring queries made from this callback to avoid
        // contending with the auth client's internal event lock.
        setTimeout(() => void hydrateSession(s), 0);
      });
      sub = res.data;

      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        await hydrateSession(data.session);
      } catch (e) {
        console.error("[auth] getSession failed", e);
        if (mounted) setLoading(false);
      }
    })();

    // عند عودة الإنترنت نُحدّث بيانات الحساب بهدوء
    const onOnline = () => {
      void (async () => {
        const { data } = await supabase.auth.getSession();
        if (mounted) await hydrateSession(data.session);
      })();
    };
    if (typeof window !== "undefined") window.addEventListener("online", onOnline);

    return () => {
      mounted = false;
      if (typeof window !== "undefined") window.removeEventListener("online", onOnline);
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      profile,
      role,
      isSuperadmin,
      loading,
      profileError,


      signOut: async () => {
        // Clear local state first so UI updates immediately
        setSession(null);
        setUser(null);
        setProfile(null);
        setRole(null);
        setIsSuperadmin(false);

        try {
          await supabase.auth.signOut({ scope: "local" });
          await clearNativeAuthStorage();
          const { clearLocalDB } = await import("@/lib/local-db");
          await clearLocalDB();
        } catch (e) {
          console.error("[auth] signOut failed", e);
        }
        // Purge any stale supabase tokens from storage (belt & suspenders for WebView)
        if (typeof window !== "undefined") {
          try {
            Object.keys(window.localStorage)
              .filter(
                (k) =>
                  k.startsWith("sb-") ||
                  k.includes("supabase") ||
                  k.startsWith(ACCOUNT_CACHE_PREFIX),
              )
              .forEach((k) => window.localStorage.removeItem(k));
          } catch {}
          // Hard reload to /auth so no cached protected state remains
          window.location.href = "/auth";
        }
      },
      refresh: async () => {
        if (!user) return;
        setLoading(true);
        setProfileError(null);
        try {
          const account = await loadProfile(user.id);
          setProfile(account.profile);
          setRole(account.role);
          setIsSuperadmin(account.isSuperadmin);
          setProfileError(null);
          writeAccountCache(user.id, account);
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          setProfileError(
            message && message !== "PROFILE_NOT_READY"
              ? message
              : "تعذر تحميل بيانات الحساب، أعد المحاولة.",
          );
          throw error;
        } finally {
          setLoading(false);
        }
      },
    }),
    [user, session, profile, role, isSuperadmin, loading, profileError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
