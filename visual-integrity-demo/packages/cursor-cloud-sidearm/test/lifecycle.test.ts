import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SidearmConfig } from "../src/types.js";

const state = vi.hoisted(() => ({
  createCalls: [] as unknown[],
  sendCalls: [] as unknown[],
  disposed: false,
  events: [] as unknown[],
}));

vi.mock("@cursor/sdk", () => {
  function makeRun() {
    return {
      id: "run-1",
      async *stream() {
        for (const event of state.events) yield event;
      },
      onDidChangeStatus(_listener: (status: string) => void) {
        return () => {};
      },
      async wait() {
        return { status: "finished", result: "all done", requestId: "req-1", durationMs: 555 };
      },
    };
  }

  const fakeAgent = {
    agentId: "agent-1",
    async send(prompt: string, options: unknown) {
      state.sendCalls.push({ prompt, options });
      return makeRun();
    },
    async listArtifacts() {
      return [{ path: "report.json", sizeBytes: 10, updatedAt: "2026-07-04T00:00:00.000Z" }];
    },
    async downloadArtifact(artifactPath: string) {
      return Buffer.from(`bytes of ${artifactPath}`);
    },
    async [Symbol.asyncDispose]() {
      state.disposed = true;
    },
  };

  return {
    Agent: {
      create: vi.fn(async (options: unknown) => {
        state.createCalls.push(options);
        return fakeAgent;
      }),
      list: vi.fn(async () => ({ items: [{ agentId: "agent-1", name: "job", status: "finished" }] })),
    },
    Cursor: {
      models: {
        list: vi.fn(async () => [{ id: "composer-2.5", displayName: "Composer 2.5" }]),
      },
    },
  };
});

const { createCloudAgent, listCloudAgents, resolveModelId, runCloudJob, streamCloudRun } = await import(
  "../src/lifecycle.js"
);

function config(overrides: Partial<SidearmConfig> = {}): SidearmConfig {
  return {
    apiKey: "test-key",
    modelId: "composer-2.5",
    profile: "cloud-env",
    cloudEnvName: "test-env",
    ...overrides,
  };
}

beforeEach(() => {
  state.createCalls.length = 0;
  state.sendCalls.length = 0;
  state.disposed = false;
  state.events = [
    { type: "assistant", message: { content: [{ type: "text", text: "hello " }] } },
    { type: "tool_call", name: "shell", status: "completed", args: { command: "ls" } },
    { type: "status", status: "running", message: "booting" },
    { type: "task", text: "doing work" },
    { type: "usage", usage: { totalTokens: 42 } },
    { type: "assistant", message: { content: [{ type: "text", text: "world" }] } },
  ];
});

describe("resolveModelId", () => {
  it("returns the preferred model when the account has it", async () => {
    const id = await resolveModelId(config({ modelId: "composer-2.5" }));
    expect(id).toBe("composer-2.5");
  });

  it("falls back to a composer model when the preferred id is unavailable", async () => {
    const id = await resolveModelId(config({ modelId: "does-not-exist" }));
    expect(id).toBe("composer-2.5");
  });
});

describe("createCloudAgent", () => {
  it("throws without an apiKey", async () => {
    await expect(
      createCloudAgent({ name: "job", prompt: "do it", envVars: {} }, config({ apiKey: undefined }))
    ).rejects.toThrow(/apiKey.*required/);
  });

  it("creates an agent with the resolved cloud profile", async () => {
    const { agent, profile } = await createCloudAgent(
      { name: "job", prompt: "do it", envVars: {} },
      config()
    );
    expect(agent.agentId).toBe("agent-1");
    expect(profile).toBe("cloud-env");
    expect(state.createCalls).toHaveLength(1);
  });
});

describe("streamCloudRun", () => {
  it("rejects unsafe env vars before sending", async () => {
    const { agent } = await createCloudAgent({ name: "job", prompt: "do it", envVars: {} }, config());
    await expect(
      streamCloudRun(agent, "do it", { CURSOR_API_KEY: "leak" })
    ).rejects.toThrow(/CURSOR_ prefix/);
    expect(state.sendCalls).toHaveLength(0);
  });

  it("streams text through onText and reports phases/tool calls via hooks", async () => {
    const { agent } = await createCloudAgent({ name: "job", prompt: "do it", envVars: {} }, config());
    const texts: string[] = [];
    const phases: string[] = [];
    const toolCalls: Array<{ name: string; status: string }> = [];

    const { result, transcript } = await streamCloudRun(agent, "do it", { HACK_RAISE_RUN_ID: "r1" }, {
      onText: (text) => texts.push(text),
      onPhase: (message) => phases.push(message),
      onToolCall: (name, status) => toolCalls.push({ name, status }),
    });

    expect(transcript).toBe("hello world");
    expect(texts).toEqual(["hello ", "world"]);
    expect(result.status).toBe("finished");
    expect(toolCalls).toEqual([{ name: "shell", status: "completed" }]);
    expect(phases.some((p) => p.includes("Run started"))).toBe(true);
    expect(phases.some((p) => p.includes("Run finished: finished"))).toBe(true);
    expect(state.sendCalls[0]).toMatchObject({
      prompt: "do it",
      options: { cloud: { envVars: { HACK_RAISE_RUN_ID: "r1" } } },
    });
  });
});

describe("runCloudJob", () => {
  it("runs the full lifecycle and disposes the agent", async () => {
    const result = await runCloudJob(
      { name: "job", prompt: "do it", envVars: { HACK_RAISE_RUN_ID: "r1" } },
      config()
    );

    expect(result.agentId).toBe("agent-1");
    expect(result.profile).toBe("cloud-env");
    expect(result.status).toBe("finished");
    expect(result.resultText).toBe("all done");
    expect(result.transcript).toBe("hello world");
    expect(result.artifacts).toEqual([
      { path: "report.json", sizeBytes: 10, updatedAt: "2026-07-04T00:00:00.000Z" },
    ]);
    expect(result.downloadedPaths).toEqual([]);
    expect(state.disposed).toBe(true);
  });

  it("downloads artifacts when artifactsDir is set", async () => {
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    const destDir = await mkdtemp(path.join(tmpdir(), "sidearm-run-"));

    try {
      const result = await runCloudJob(
        { name: "job", prompt: "do it", envVars: {}, artifactsDir: destDir },
        config()
      );
      expect(result.downloadedPaths).toEqual([path.join(destDir, "report.json")]);
    } finally {
      await rm(destDir, { recursive: true, force: true });
    }
  });
});

describe("listCloudAgents", () => {
  it("throws without an apiKey", async () => {
    await expect(listCloudAgents(config({ apiKey: undefined }))).rejects.toThrow(
      /apiKey.*required/
    );
  });

  it("lists cloud agents for a valid config", async () => {
    const result = await listCloudAgents(config());
    expect(result.items).toHaveLength(1);
  });
});
