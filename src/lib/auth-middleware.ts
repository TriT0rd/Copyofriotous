import { createMiddleware } from "@tanstack/react-start";
import { decodeToken, isAdminEmail, type AuthUser } from "@/lib/auth";
import { ensureDbSchema, getSql } from "@/lib/db";

export type AuthenticatedContext = {
  userId: string;
  user: AuthUser;
  isAdmin: boolean;
  sql: ReturnType<typeof getSql>;
};

export const requireAuth = createMiddleware({ type: "function" })
  .client(async (opts) => {
    let token: string | null = null;
    if (typeof window !== "undefined") {
      try {
        token = localStorage.getItem("riotous_session");
        if (token) {
          document.cookie = `riotous_session=${encodeURIComponent(token)}; path=/; max-age=2592000; SameSite=Lax`;
        }
      } catch {
        // ignore
      }
    }
    return opts.next({
      headers: token
        ? {
            Authorization: `Bearer ${token}`,
            "x-riotous-session": token,
          }
        : {},
      sendContext: {
        token: token || undefined,
      },
    });
  })
  .server(async (opts: any) => {
    const { next, data, request, headers, context } = opts;
    await ensureDbSchema();
    const sql = getSql();
    let token: string | null = null;

    // 1. Check if token was sent via client middleware sendContext
    if (
      context &&
      typeof context === "object" &&
      typeof context.token === "string" &&
      context.token.trim()
    ) {
      token = context.token.trim();
    }

    // 2. Check if token was explicitly passed in payload
    if (!token) {
      if (data && typeof data === "object") {
        if (typeof data.token === "string" && data.token.trim()) {
          token = data.token.trim();
        }
      } else if (typeof data === "string" && data.trim()) {
        token = data.trim();
      }
    }

    // 3. Check opts.headers / opts.request headers / x-riotous-session / Authorization
    if (!token) {
      try {
        const reqHeaders = headers || request?.headers;
        if (reqHeaders) {
          const authH =
            reqHeaders.get?.("authorization") ||
            reqHeaders.get?.("Authorization") ||
            reqHeaders.get?.("x-riotous-session") ||
            reqHeaders["authorization"] ||
            reqHeaders["Authorization"] ||
            reqHeaders["x-riotous-session"];
          if (typeof authH === "string") {
            if (authH.startsWith("Bearer ")) {
              token = authH.substring(7).trim();
            } else if (authH.trim()) {
              token = authH.trim();
            }
          }
          if (!token) {
            const cookieH =
              reqHeaders.get?.("cookie") ||
              reqHeaders["cookie"] ||
              reqHeaders.get?.("Cookie") ||
              reqHeaders["Cookie"];
            if (typeof cookieH === "string") {
              const match = cookieH.match(/riotous_session=([^;]+)/);
              if (match) {
                token = decodeURIComponent(match[1]);
              }
            }
          }
        }
      } catch {
        // ignore
      }
    }

    // 4. Try server utils from TanStack Start dynamically
    if (!token) {
      try {
        const serverMod = await import("@tanstack/react-start/server");
        if (typeof serverMod.getCookie === "function") {
          const cookieVal = serverMod.getCookie("riotous_session");
          if (cookieVal) {
            token = decodeURIComponent(cookieVal);
          }
        }
        if (!token && typeof serverMod.getRequestHeader === "function") {
          const authH =
            serverMod.getRequestHeader("authorization") ||
            serverMod.getRequestHeader("x-riotous-session");
          if (authH) {
            if (authH.startsWith("Bearer ")) {
              token = authH.substring(7).trim();
            } else {
              token = authH.trim();
            }
          }
        }
        if (!token && typeof serverMod.getRequest === "function") {
          const webReq = serverMod.getRequest();
          if (webReq?.headers) {
            const authH =
              webReq.headers.get("authorization") ||
              webReq.headers.get("Authorization") ||
              webReq.headers.get("x-riotous-session");
            if (authH) {
              if (authH.startsWith("Bearer ")) {
                token = authH.substring(7).trim();
              } else {
                token = authH.trim();
              }
            }
            if (!token) {
              const cookieH = webReq.headers.get("cookie");
              if (cookieH) {
                const match = cookieH.match(/riotous_session=([^;]+)/);
                if (match) {
                  token = decodeURIComponent(match[1]);
                }
              }
            }
          }
        }
        if (!token && typeof serverMod.getRequestHeaders === "function") {
          const allHeaders = serverMod.getRequestHeaders();
          if (allHeaders) {
            const authH =
              allHeaders["authorization"] ||
              allHeaders["Authorization"] ||
              allHeaders["x-riotous-session"];
            if (typeof authH === "string") {
              if (authH.startsWith("Bearer ")) {
                token = authH.substring(7).trim();
              } else if (authH.trim()) {
                token = authH.trim();
              }
            }
            if (!token) {
              const cookieH = allHeaders["cookie"] || allHeaders["Cookie"];
              if (typeof cookieH === "string") {
                const match = cookieH.match(/riotous_session=([^;]+)/);
                if (match) {
                  token = decodeURIComponent(match[1]);
                }
              }
            }
          }
        }
      } catch {
        // ignore
      }
    }

    // Fallback / decode user from token
    let user: AuthUser | null = null;
    if (token) {
      user = decodeToken(token);
    }

    if (!user) {
      throw new Error("Unauthorized: Please sign in to perform this action.");
    }

    let isAdmin = user.role === "admin" || isAdminEmail(user.email);
    try {
      const rows = await sql`
        SELECT id, role, email FROM profiles WHERE id = ${user.id} OR email = ${user.email} LIMIT 1
      `;
      if (rows.length > 0) {
        const dbRole = rows[0].role as "admin" | "customer";
        if (dbRole === "admin") {
          isAdmin = true;
          user.role = "admin";
        }
      }
    } catch {
      // fallback to token role and email allowlist
    }

    if (isAdminEmail(user.email)) {
      isAdmin = true;
      user.role = "admin";
      try {
        await sql`UPDATE profiles SET role = 'admin' WHERE id = ${user.id} OR email = ${user.email}`;
      } catch {
        // ignore
      }
    }

    return next({
      context: {
        userId: user.id,
        user,
        isAdmin,
        sql,
      },
    });
  });
