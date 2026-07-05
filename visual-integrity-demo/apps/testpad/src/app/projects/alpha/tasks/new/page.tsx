"use client";

import { FormEvent, useState } from "react";

export default function NewTaskPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/projects/alpha/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.get("title"),
        description: form.get("description"),
      }),
    });

    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      setError(body.error ?? `Request failed (${response.status})`);
      setLoading(false);
      return;
    }

    setLoading(false);
  }

  return (
    <div
      className="card"
      data-route="/projects/alpha/tasks/new"
      data-bug="BUG_TASK_CREATE_500"
    >
      <h1>Create task</h1>
      <form onSubmit={onSubmit}>
        <label htmlFor="title">Title</label>
        <input id="title" name="title" defaultValue="Verify checkout flow" required />
        <label htmlFor="description">Description</label>
        <textarea
          id="description"
          name="description"
          defaultValue="Run smoke test on staging."
        />
        {error && (
          <p className="error" data-testid="task-error">
            {error}
          </p>
        )}
        <button type="submit" disabled={loading}>
          {loading ? "Creating..." : "Create task"}
        </button>
      </form>
    </div>
  );
}
