import { listCloudAgents } from "@hack-raise/cursor-cloud-sidearm";
import { loadOrchestratorEnv } from "./env.js";

async function main() {
  const env = loadOrchestratorEnv();
  if (!env.apiKey) {
    throw new Error("CURSOR_API_KEY is required");
  }

  const { items, nextCursor } = await listCloudAgents(env, 20);

  console.log(`Recent cloud agents (${items.length}):`);
  for (const item of items) {
    console.log(`- ${item.agentId}  ${item.name ?? "(untitled)"}  status=${item.status ?? "unknown"}`);
  }
  if (nextCursor) {
    console.log(`More available (cursor: ${nextCursor.slice(0, 12)}...)`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
