import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

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

// Convert username -> synthetic internal email
export const usernameToEmail = (u: string) =>
  `${u
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")}@wificards.local`;

export function AuthProvider({ children }: { children: ReactNode }) {
  const hydrationId = useRef(0);
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
    setProfile(prof as Profile | null);
    const has = (name: string) => !!roles?.find((x) => x.role === name);
    setIsSuperadmin(has("superadmin"));
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
    setRole((r as Role | null) ?? null);
    setProfileError(null);
  };

  // Retries transient failures (flaky mobile networks / cold start) instead of
  // silently leaving profile=null, which used to render an endless "loading" UI.
  const loadProfile = async (uid: string, attempts = 5) => {
    let lastErr: unknown = null;
    for (let i = 0; i < attempts; i++) {
      try {
        await loadProfileOnce(uid);
        return;
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, Math.min(600 * 2 ** i, 4000)));
      }
    }
    const msg = (lastErr as any)?.message ? String((lastErr as any).message) : "";
    setProfileError(
      msg && msg !== "PROFILE_NOT_READY" ? msg : "تعذر تحميل بيانات الحساب، أعد المحاولة.",
    );
    throw lastErr;
  };


  useEffect(() => {
    let mounted = true;

    const hydrateSession = async (nextSession: Session | null) => {
      const requestId = ++hydrationId.current;

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (!nextSession?.user) {
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
      setLoading(true);
      setProfileError(null);
      try {
        await loadProfile(nextSession.user.id);
      } catch (error) {
        console.error("[auth] profile hydration failed", error);
      } finally {
        if (mounted && requestId === hydrationId.current) setLoading(false);
      }
    };

    // Listener first to avoid missing initial event
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      if (!mounted) return;
      // Supabase advises deferring queries made from this callback to avoid
      // contending with the auth client's internal event lock.
      setTimeout(() => void hydrateSession(s), 0);
    });

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        await hydrateSession(data.session);
      } catch (e) {
        console.error("[auth] getSession failed", e);
        if (mounted) setLoading(false);
      }
    })();

    // Long safety net only (10s) — protects against a truly hung getSession call.
    const failsafe = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 10000);

    return () => {
      mounted = false;
      clearTimeout(failsafe);
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
        } catch (e) {
          console.error("[auth] signOut failed", e);
        }
        // Purge any stale supabase tokens from storage (belt & suspenders for WebView)
        if (typeof window !== "undefined") {
          try {
            Object.keys(window.localStorage)
              .filter((k) => k.startsWith("sb-") || k.includes("supabase"))
              .forEach((k) => window.localStorage.removeItem(k));
          } catch {}
          // Hard reload to /auth so no cached protected state remains
          window.location.href = "/auth";
        }
      },
      refresh: async () => {
        if (user) await loadProfile(user.id);
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
