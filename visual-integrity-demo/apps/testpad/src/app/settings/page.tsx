import { getSession } from "@/lib/session";

export default async function SettingsPage() {
  const session = await getSession();

  return (
    <div className="card" data-route="/settings">
      <h1>Settings</h1>
      {session ? (
        <p>
          Signed in as <strong>{session.email}</strong> ({session.role})
        </p>
      ) : (
        <p className="muted">Not signed in.</p>
      )}
    </div>
  );
}
