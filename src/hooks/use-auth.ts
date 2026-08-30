import { useEffect, useState } from "react";
import {
  decodeToken,
  getCurrentUserServerFn,
  loginServerFn,
  registerServerFn,
  type AuthSession,
  type AuthUser,
} from "@/lib/auth";

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    function loadUser() {
      const token = localStorage.getItem("riotous_session");
      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }
      const decoded = decodeToken(token);
      if (decoded) {
        setUser(decoded);
        setLoading(false);
        // Verify with server in background
        getCurrentUserServerFn({ data: { token } })
          .then((u) => {
            if (u) setUser(u);
            else {
              localStorage.removeItem("riotous_session");
              setUser(null);
            }
          })
          .catch(() => {});
      } else {
        localStorage.removeItem("riotous_session");
        setUser(null);
        setLoading(false);
      }
    }

    loadUser();

    function handleAuthChange() {
      loadUser();
    }

    window.addEventListener("riotous_auth_changed", handleAuthChange);
    window.addEventListener("storage", handleAuthChange);

    return () => {
      window.removeEventListener("riotous_auth_changed", handleAuthChange);
      window.removeEventListener("storage", handleAuthChange);
    };
  }, []);

  const login = async (email: string, password: string) => {
    const res = await loginServerFn({ data: { email, password } });
    if (res.ok && res.session) {
      localStorage.setItem("riotous_session", res.session.token);
      document.cookie = `riotous_session=${encodeURIComponent(res.session.token)}; path=/; max-age=2592000`;
      setUser(res.session.user);
      window.dispatchEvent(new Event("riotous_auth_changed"));
    }
    return res;
  };

  const register = async (email: string, password: string, fullName?: string) => {
    const res = await registerServerFn({ data: { email, password, fullName } });
    if (res.ok && res.session) {
      localStorage.setItem("riotous_session", res.session.token);
      document.cookie = `riotous_session=${encodeURIComponent(res.session.token)}; path=/; max-age=2592000`;
      setUser(res.session.user);
      window.dispatchEvent(new Event("riotous_auth_changed"));
    }
    return res;
  };

  const logout = () => {
    localStorage.removeItem("riotous_session");
    document.cookie = "riotous_session=; path=/; max-age=0";
    setUser(null);
    window.dispatchEvent(new Event("riotous_auth_changed"));
  };

  return {
    user,
    session: user ? { user } : null,
    loading,
    login,
    register,
    signIn: login,
    signUp: register,
    logout,
    signOut: logout,
  };
}
