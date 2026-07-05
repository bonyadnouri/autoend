import { describe, expect, it, vi } from "vitest";
import type { SidearmConfig } from "../src/types.js";

const state = vi.hoisted(() => ({
  modelsListShouldThrow: false,
}));

vi.mock("@cursor/sdk", () => ({
  Agent: { create: vi.fn(), list: vi.fn() },
  Cursor: {
    models: {
      list: vi.fn(async () => {
        if (state.modelsListShouldThrow) throw new Error("unauthorized");
        return [{ id: "composer-2.5", displayName: "Composer 2.5" }];
      }),
    },
  },
}));

const { checkSidearmEnvironment } = await import("../src/env-check.js");

function config(overrides: Partial<SidearmConfig> = {}): SidearmConfig {
  return { modelId: "composer-2.5", profile: "local-dev", ...overrides };
}

describe("checkSidearmEnvironment", () => {
  it("skips cloud option and API checks for local-dev with no key", async () => {
    const report = await checkSidearmEnvironment(config());
    expect(report.profile).toBe("local-dev");
    expect(report.apiKeyPresent).toBe(false);
    expect(report.cloudOptionsOk).toBe(false);
    expect(report.apiAuthOk).toBeUndefined();
  });

  it("reports cloud-env options as OK when cloudEnvName is set", async () => {
    const report = await checkSidearmEnvironment(
      config({ profile: "cloud-env", cloudEnvName: "hack-raise-testbed" })
    );
    expect(report.cloudOptionsOk).toBe(true);
    expect(report.cloudOptionsError).toBeUndefined();
  });

  it("reports a cloud option error when cloud-env is missing cloudEnvName", async () => {
    const report = await checkSidearmEnvironment(config({ profile: "cloud-env" }));
    expect(report.cloudOptionsOk).toBe(false);
    expect(report.cloudOptionsError).toMatch(/cloudEnvName is required/);
  });

  it("checks API auth and preferred model availability when apiKey is present", async () => {
    state.modelsListShouldThrow = false;
    const report = await checkSidearmEnvironment(config({ apiKey: "key", modelId: "composer-2.5" }));
    expect(report.apiAuthOk).toBe(true);
    expect(report.modelCount).toBe(1);
    expect(report.preferredModelAvailable).toBe(true);
  });

  it("reports a failed model available check for an unknown preferred model", async () => {
    const report = await checkSidearmEnvironment(config({ apiKey: "key", modelId: "unknown-model" }));
    expect(report.preferredModelAvailable).toBe(false);
  });

  it("reports API auth failure when the key is rejected", async () => {
    state.modelsListShouldThrow = true;
    const report = await checkSidearmEnvironment(config({ apiKey: "bad-key" }));
    expect(report.apiAuthOk).toBe(false);
    expect(report.apiAuthError).toMatch(/unauthorized/);
    state.modelsListShouldThrow = false;
  });
});
