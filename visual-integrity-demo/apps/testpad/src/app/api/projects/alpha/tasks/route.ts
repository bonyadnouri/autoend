// BUG_TASK_CREATE_500: deterministic server error
export async function POST(request: Request) {
  const body = (await request.json()) as { title?: string; description?: string };

  if (!body.title?.trim()) {
    return Response.json({ error: "Title is required" }, { status: 400 });
  }

  return Response.json(
    {
      error: "Internal server error",
      bugId: "BUG_TASK_CREATE_500",
      message: "Task creation intentionally fails for test scenarios.",
    },
    { status: 500 }
  );
}
