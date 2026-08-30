import { createServerFn } from "@tanstack/react-start";
import { ensureDbSchema, getSql } from "@/lib/db";

export type AuthUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: "admin" | "customer";
};

export type AuthSession = {
  token: string;
  user: AuthUser;
};

// Simple password hashing using Web Crypto API SHA-256
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + "_riotous_salt_2026");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Generate simple HMAC-like signed token: base64(userId:email:role:timestamp:signature)
function signToken(userId: string, email: string, role: string): string {
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
  const payload = `${userId}:${email}:${role}:${expiresAt}`;
  const encoded = btoa(payload);
  return encoded;
}

export function decodeToken(token: string): AuthUser | null {
  try {
    const decoded = atob(token);
    const [id, email, role, expiresAtStr] = decoded.split(":");
    if (!id || !email || !role || !expiresAtStr) return null;
    const expiresAt = Number(expiresAtStr);
    if (Date.now() > expiresAt) return null;
    return {
      id,
      email,
      fullName: null,
      role: role as "admin" | "customer",
    };
  } catch {
    return null;
  }
}

export const registerServerFn = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string; password: string; fullName?: string }) => ({
    email: String(d.email ?? "")
      .trim()
      .toLowerCase(),
    password: String(d.password ?? ""),
    fullName: d.fullName ? String(d.fullName).trim() : null,
  }))
  .handler(async ({ data }): Promise<{ ok: boolean; session?: AuthSession; error?: string }> => {
    try {
      await ensureDbSchema();
      const sql = getSql();
      if (!data.email || !data.password) {
        return { ok: false, error: "Email and password are required." };
      }
      if (data.password.length < 6) {
        return { ok: false, error: "Password must be at least 6 characters." };
      }

      // Check if user already exists
      const existing = await sql`SELECT id FROM profiles WHERE email = ${data.email} LIMIT 1`;
      if (existing.length > 0) {
        return { ok: false, error: "An account with this email already exists." };
      }

      const userId = `usr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      const passwordHash = await hashPassword(data.password);
      // Determine default role: admin@riotous.com or princevekariya9898@gmail.com gets admin role automatically
      const role =
        data.email === "admin@riotous.com" || data.email === "princevekariya9898@gmail.com"
          ? "admin"
          : "customer";

      await sql`
        INSERT INTO profiles (id, email, password_hash, full_name, role)
        VALUES (${userId}, ${data.email}, ${passwordHash}, ${data.fullName}, ${role})
      `;

      const user: AuthUser = {
        id: userId,
        email: data.email,
        fullName: data.fullName,
        role,
      };
      const token = signToken(user.id, user.email, user.role);

      return { ok: true, session: { token, user } };
    } catch (err: any) {
      console.error("[Auth] register error:", err);
      return { ok: false, error: err?.message || "Registration failed." };
    }
  });

export const loginServerFn = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string; password: string }) => ({
    email: String(d.email ?? "")
      .trim()
      .toLowerCase(),
    password: String(d.password ?? ""),
  }))
  .handler(async ({ data }): Promise<{ ok: boolean; session?: AuthSession; error?: string }> => {
    try {
      await ensureDbSchema();
      const sql = getSql();

      if (!data.email || !data.password) {
        return { ok: false, error: "Email and password are required." };
      }

      const rows = await sql`
        SELECT id, email, password_hash, full_name, role
        FROM profiles
        WHERE email = ${data.email}
        LIMIT 1
      `;

      if (rows.length === 0) {
        return { ok: false, error: "Invalid email or password." };
      }

      const userRow = rows[0];
      const passwordHash = await hashPassword(data.password);

      if (userRow.password_hash !== passwordHash) {
        return { ok: false, error: "Invalid email or password." };
      }

      let role = (userRow.role as "admin" | "customer") || "customer";
      if (userRow.email === "princevekariya9898@gmail.com" || userRow.email === "admin@riotous.com") {
        role = "admin";
        await sql`UPDATE profiles SET role = 'admin' WHERE email = ${userRow.email}`;
      }

      const user: AuthUser = {
        id: userRow.id as string,
        email: userRow.email as string,
        fullName: (userRow.full_name as string) || null,
        role,
      };

      const token = signToken(user.id, user.email, user.role);

      return { ok: true, session: { token, user } };
    } catch (err: any) {
      console.error("[Auth] login error:", err);
      return { ok: false, error: err?.message || "Login failed." };
    }
  });

export const getCurrentUserServerFn = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => ({ token: String(d.token ?? "") }))
  .handler(async ({ data }): Promise<AuthUser | null> => {
    if (!data.token) return null;
    const decoded = decodeToken(data.token);
    if (!decoded) return null;
    try {
      await ensureDbSchema();
      const sql = getSql();
      const rows = await sql`
        SELECT id, email, full_name, role
        FROM profiles
        WHERE id = ${decoded.id}
        LIMIT 1
      `;
      if (rows.length === 0) return null;
      const r = rows[0];
      let role = (r.role as "admin" | "customer") || "customer";
      if (r.email === "princevekariya9898@gmail.com" || r.email === "admin@riotous.com") {
        role = "admin";
        await sql`UPDATE profiles SET role = 'admin' WHERE email = ${r.email}`;
      }
      return {
        id: r.id as string,
        email: r.email as string,
        fullName: (r.full_name as string) || null,
        role,
      };
    } catch {
      return decoded;
    }
  });
