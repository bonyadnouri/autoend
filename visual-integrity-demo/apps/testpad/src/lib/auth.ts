export type UserRole = "user" | "admin";

export interface SessionUser {
  email: string;
  role: UserRole;
}

export const USERS: Record<string, { password: string; role: UserRole }> = {
  "user@example.com": { password: "password123", role: "user" },
  "admin@example.com": { password: "admin123", role: "admin" },
};

export function authenticate(
  email: string,
  password: string
): SessionUser | null {
  const record = USERS[email];
  if (!record || record.password !== password) return null;
  return { email, role: record.role };
}

export function parseSessionCookie(
  cookieHeader: string | null
): SessionUser | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/testpad_session=([^;]+)/);
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match[1])) as SessionUser;
  } catch {
    return null;
  }
}

export function serializeSession(user: SessionUser): string {
  return `testpad_session=${encodeURIComponent(JSON.stringify(user))}; Path=/; HttpOnly; SameSite=Lax`;
}

export function clearSessionCookie(): string {
  return "testpad_session=; Path=/; Max-Age=0";
}
