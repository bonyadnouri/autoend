import { getSession } from "@/lib/session";

// BUG_ADMIN_AUTHZ: page renders for any authenticated user, not just admin
export default async function AdminUsersPage() {
  const session = await getSession();

  return (
    <div
      className="card"
      data-route="/admin/users"
      data-bug="BUG_ADMIN_AUTHZ"
      data-role={session?.role ?? "anonymous"}
    >
      <h1>Admin — Users</h1>
      <p className="muted">
        Restricted admin view. Normal users should not see this content.
      </p>
      <ul>
        <li>user@example.com — user</li>
        <li>admin@example.com — admin</li>
      </ul>
      {session?.role !== "admin" && (
        <p className="error" data-testid="authz-leak">
          Authorization bug: non-admin session can view admin page.
        </p>
      )}
    </div>
  );
}
