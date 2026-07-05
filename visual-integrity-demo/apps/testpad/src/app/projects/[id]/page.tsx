import Link from "next/link";
import { notFound } from "next/navigation";

const PROJECTS: Record<string, { name: string; description: string }> = {
  alpha: {
    name: "Alpha",
    description: "Primary project for task creation scenarios.",
  },
  beta: {
    name: "Beta",
    description: "Secondary project (link intentionally broken from list).",
  },
};

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = PROJECTS[id];

  if (!project) {
    notFound();
  }

  return (
    <div className="card" data-route={`/projects/${id}`}>
      <h1>{project.name}</h1>
      <p className="muted">{project.description}</p>
      {id === "alpha" && (
        <Link href="/projects/alpha/tasks/new" className="button">
          Create task
        </Link>
      )}
    </div>
  );
}
