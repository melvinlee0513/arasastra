import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type UserRole = "admin" | "student" | "tutor" | "superadmin";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: UserRole | null;
  roles: UserRole[];
  isLoading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isTutor: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  form_year: string | null;
  phone: string | null;
  created_at: string | null;
  is_registered: boolean;
  parent_name: string | null;
  plan_id: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const fetchingRef = useRef<string | null>(null);

  useEffect(() => {
    // 1. Register listener FIRST so we don't miss the SIGNED_IN event.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        setSession(nextSession);
        setUser(nextSession?.user ?? null);

        if (nextSession?.user) {
          // Arm loading again so downstream guards wait for the role to hydrate
          // instead of briefly seeing user=set/role=null and misrouting.
          if (fetchingRef.current !== nextSession.user.id) {
            fetchingRef.current = nextSession.user.id;
            setIsLoading(true);
            setTimeout(() => {
              fetchUserData(nextSession.user.id);
            }, 0);
          }
        } else {
          fetchingRef.current = null;
          setProfile(null);
          setRole(null);
          setRoles([]);
          setIsLoading(false);
          if (import.meta.env.DEV) {
            console.info("[auth] signed out or no session", { event });
          }
        }
      }
    );

    // 2. THEN check for an existing session.
    supabase.auth.getSession().then(({ data: { session: existing } }) => {
      setSession(existing);
      setUser(existing?.user ?? null);
      if (existing?.user) {
        if (fetchingRef.current !== existing.user.id) {
          fetchingRef.current = existing.user.id;
          fetchUserData(existing.user.id);
        }
      } else {
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserData = async (userId: string) => {
    // Run independently so a failure in one query does NOT prevent the other
    // from populating state. Previously a Promise.all with .single() on the
    // profile would reject the whole batch when the profile row was missing
    // or blocked by RLS, leaving `role` null forever → login loop.
    const [profileRes, roleRes] = await Promise.allSettled([
      supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);

    try {
      if (profileRes.status === "fulfilled") {
        if (profileRes.value.error) {
          console.error("[auth] profile query error", profileRes.value.error);
        } else if (profileRes.value.data) {
          setProfile(profileRes.value.data as Profile);
        }
      } else {
        console.error("[auth] profile fetch rejected", profileRes.reason);
      }

      if (roleRes.status === "fulfilled") {
        if (roleRes.value.error) {
          console.error("[auth] roles query error", roleRes.value.error);
        } else if (roleRes.value.data) {
          const rolesList = (roleRes.value.data as { role: UserRole }[]).map((r) => r.role);
          setRoles(rolesList);
          const priority: UserRole[] = ["superadmin", "admin", "tutor", "student"];
          const primary = priority.find((p) => rolesList.includes(p)) ?? null;
          setRole(primary);
          if (import.meta.env.DEV) {
            console.info("[auth] roles hydrated", { userId, rolesList, primary });
          }
        }
      } else {
        console.error("[auth] roles fetch rejected", roleRes.reason);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { full_name: fullName }
      }
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    fetchingRef.current = null;
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRole(null);
    setRoles([]);
  };

  const isSuperAdmin = role === "superadmin" || roles.includes("superadmin");
  const isAdmin = isSuperAdmin || role === "admin" || roles.includes("admin");

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        role,
        roles,
        isLoading,
        isAdmin,
        isSuperAdmin,
        isTutor: role === "tutor",
        signIn,
        signUp,
        signOut
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

const defaultAuthContext: AuthContextType = {
  user: null,
  session: null,
  profile: null,
  role: null,
  roles: [],
  isLoading: true,
  isAdmin: false,
  isSuperAdmin: false,
  isTutor: false,
  signIn: async () => ({ error: new Error("AuthProvider not mounted") }),
  signUp: async () => ({ error: new Error("AuthProvider not mounted") }),
  signOut: async () => {},
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    console.warn("useAuth called outside AuthProvider — returning defaults");
    return defaultAuthContext;
  }
  return context;
}
