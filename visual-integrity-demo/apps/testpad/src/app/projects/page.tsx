import Link from "next/link";

// BUG_BROKEN_PROJECT_LINK: Beta link points to missing-id
export default function ProjectsPage() {
  return (
    <div className="card" data-route="/projects" data-bug="BUG_BROKEN_PROJECT_LINK">
      <h1>Projects</h1>
      <div className="grid two">
        <div className="card">
          <h2>Alpha</h2>
          <p className="muted">Stable project with task creation flow.</p>
          <Link href="/projects/alpha" className="button">
            Open Alpha project
          </Link>
        </div>
        <div className="card">
          <h2>Beta</h2>
          <p className="muted">Should open /projects/beta.</p>
          <Link
            href="/projects/missing-id"
            className="button secondary"
            data-testid="open-beta-project"
          >
            Open Beta project
          </Link>
        </div>
      </div>
    </div>
  );
}
