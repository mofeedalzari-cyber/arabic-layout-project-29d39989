import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Role = "admin" | "agent";

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
  loading: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Convert username -> synthetic internal email
export const usernameToEmail = (u: string) =>
  `${u.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "")}@wificards.local`;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (uid: string) => {
    const [{ data: prof }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("id, username, full_name, phone, is_active, network_id").eq("id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid),
    ]);
    setProfile(prof as Profile | null);
    const r = roles?.find((x) => x.role === "admin")?.role
      ?? roles?.find((x) => x.role === "agent")?.role
      ?? null;
    setRole((r as Role | null) ?? null);
  };

  useEffect(() => {
    let mounted = true;
    // Listener first to avoid missing initial event
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      if (!mounted) return;
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setTimeout(() => { loadProfile(s.user.id).catch(console.error); }, 0);
      } else {
        setProfile(null);
        setRole(null);
      }
    });

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        setSession(data.session);
        setUser(data.session?.user ?? null);
        if (data.session?.user) {
          try { await loadProfile(data.session.user.id); } catch (e) { console.error(e); }
        }
      } catch (e) {
        console.error("[auth] getSession failed", e);
      } finally {
        // Only release the loading gate AFTER getSession resolves.
        // Do NOT use a short failsafe here — it can flip loading=false while
        // user is still null and cause the AppLayout effect to redirect to /auth
        // (looks like: the app "freezes then goes back to login").
        if (mounted) setLoading(false);
      }
    })();

    // Long safety net only (10s) — protects against a truly hung getSession call.
    const failsafe = setTimeout(() => { if (mounted) setLoading(false); }, 10000);

    return () => { mounted = false; clearTimeout(failsafe); sub.subscription.unsubscribe(); };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user, session, profile, role, loading,
    signOut: async () => {
      // Clear local state first so UI updates immediately
      setSession(null);
      setUser(null);
      setProfile(null);
      setRole(null);
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
    refresh: async () => { if (user) await loadProfile(user.id); },
  }), [user, session, profile, role, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
