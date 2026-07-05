const startedAt = Date.now();

function elapsed(): string {
  const sec = Math.floor((Date.now() - startedAt) / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function timestamp(): string {
  return new Date().toISOString().slice(11, 19);
}

/** Default `onPhase` hook: timestamped console line. */
export function logPhase(message: string) {
  console.log(`[${timestamp()} +${elapsed()}] ${message}`);
}

export function summarizeToolArgs(name: string, args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const record = args as Record<string, unknown>;
  if (typeof record.command === "string") {
    return record.command.slice(0, 120);
  }
  if (typeof record.description === "string") {
    return record.description.slice(0, 120);
  }
  try {
    return JSON.stringify(args).slice(0, 120);
  } catch {
    return "";
  }
}

/** Default `onToolCall` hook: timestamped console line summarizing the tool call. */
export function logToolCall(name: string, status: string, args?: unknown) {
  const detail = summarizeToolArgs(name, args);
  const suffix = detail ? `: ${detail}` : "";
  logPhase(`tool ${name} (${status})${suffix}`);
}
