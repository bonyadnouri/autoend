import { redirect } from "next/navigation";
import { authenticate, serializeSession } from "@/lib/auth";

export async function POST(request: Request) {
  const body = (await request.json()) as { email?: string; password?: string };
  const user = authenticate(body.email ?? "", body.password ?? "");

  if (!user) {
    return Response.json({ error: "Invalid credentials" }, { status: 401 });
  }

  return new Response(JSON.stringify({ ok: true, user }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": serializeSession(user),
    },
  });
}

export async function GET() {
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
