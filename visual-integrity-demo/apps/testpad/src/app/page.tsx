import Link from "next/link";
import { getSession } from "@/lib/session";

export default async function HomePage() {
  const session = await getSession();

  return (
    <div className="card">
      <h1>Deterministic Testbed</h1>
      <p className="muted">
        Controlled buggy flows for Playwright and Cloud Agent debugging.
      </p>
      <div className="grid two">
        <div>
          <h2>User credentials</h2>
          <p>user@example.com / password123</p>
        </div>
        <div>
          <h2>Admin credentials</h2>
          <p>admin@example.com / admin123</p>
        </div>
      </div>
      <p>
        {session ? (
          <>
            Signed in as {session.email} ({session.role}).{" "}
            <Link href="/dashboard">Go to dashboard</Link>
          </>
        ) : (
          <Link href="/login" className="button">
            Login
          </Link>
        )}
      </p>
    </div>
  );
}
