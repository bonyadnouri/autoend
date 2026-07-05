import { cookies, headers } from "next/headers";
import { parseSessionCookie, type SessionUser } from "./auth";

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("testpad_session");
  if (sessionCookie?.value) {
    try {
      return JSON.parse(decodeURIComponent(sessionCookie.value)) as SessionUser;
    } catch {
      return null;
    }
  }
  const headerStore = await headers();
  return parseSessionCookie(headerStore.get("cookie"));
}

export async function getCorrelation(): Promise<{
  runId?: string;
  scenarioId?: string;
  role?: string;
}> {
  const headerStore = await headers();
  return {
    runId: headerStore.get("x-hack-raise-run-id") ?? undefined,
    scenarioId: headerStore.get("x-hack-raise-scenario-id") ?? undefined,
    role: headerStore.get("x-hack-raise-role") ?? undefined,
  };
}
