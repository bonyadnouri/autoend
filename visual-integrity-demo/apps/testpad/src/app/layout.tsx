import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Hack Raise Testpad",
  description: "Deterministic buggy app for agentic E2E testing",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link href="/" className="brand">
            Hack Raise Testpad
          </Link>
          <nav>
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/projects">Projects</Link>
            <Link href="/settings">Settings</Link>
            {session?.role === "admin" && (
              <Link href="/admin/users">Admin</Link>
            )}
            {session ? (
              <Link href="/logout">Logout ({session.email})</Link>
            ) : (
              <Link href="/login">Login</Link>
            )}
          </nav>
        </header>
        <main className="site-main">{children}</main>
      </body>
    </html>
  );
}
