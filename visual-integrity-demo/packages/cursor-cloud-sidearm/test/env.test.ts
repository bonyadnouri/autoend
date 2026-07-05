import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertSafeCloudEnvVars,
  loadSidearmConfig,
  newRunId,
  redactForSummary,
} from "../src/env.js";

describe("assertSafeCloudEnvVars", () => {
  it("allows plain app-namespaced env vars", () => {
    expect(() =>
      assertSafeCloudEnvVars({ HACK_RAISE_RUN_ID: "abc", HACK_RAISE_SCENARIO_ID: "s1" })
    ).not.toThrow();
  });

  it("rejects any CURSOR_ prefixed key", () => {
    expect(() => assertSafeCloudEnvVars({ CURSOR_API_KEY: "sk-123" })).toThrow(
      /CURSOR_ prefix/
    );
  });

  it("rejects keys that look like secrets", () => {
    expect(() => assertSafeCloudEnvVars({ AUTOEND_API_KEY: "x" })).toThrow(/secret-like/);
    expect(() => assertSafeCloudEnvVars({ SESSION_TOKEN: "x" })).toThrow(/secret-like/);
    expect(() => assertSafeCloudEnvVars({ DB_SECRET: "x" })).toThrow(/secret-like/);
    expect(() => assertSafeCloudEnvVars({ Authorization: "Bearer x" })).toThrow(/secret-like/);
    expect(() => assertSafeCloudEnvVars({ Cookie: "session=1" })).toThrow(/secret-like/);
  });

  it("rejects values that look like secrets even with a safe key", () => {
    expect(() => assertSafeCloudEnvVars({ SOME_URL: "https://x?token=abc" })).toThrow(
      /secret-like value/
    );
  });
});

describe("redactForSummary", () => {
  it("redacts token, key, and secret query params", () => {
    const input = "fetched https://example.com?token=abc123&other=1&key=zzz&secret=yyy";
    const output = redactForSummary(input);
    expect(output).not.toContain("abc123");
    expect(output).not.toContain("zzz");
    expect(output).not.toContain("yyy");
    expect(output).toContain("other=1");
    expect(output).toContain("[REDACTED]");
  });

  it("leaves text without secret-like params untouched", () => {
    const input = "plain transcript line, nothing sensitive here";
    expect(redactForSummary(input)).toBe(input);
  });
});

describe("newRunId", () => {
  it("returns the explicit id when provided", () => {
    expect(newRunId("run-123")).toBe("run-123");
  });

  it("mints a new id when no explicit id is given", () => {
    const a = newRunId();
    const b = newRunId();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });
});

describe("loadSidearmConfig", () => {
  const ENV_KEYS = [
    "CURSOR_API_KEY",
    "CURSOR_REPO_URL",
    "CURSOR_STARTING_REF",
    "CURSOR_CLOUD_ENV_NAME",
    "CURSOR_MODEL_ID",
    "HACK_RAISE_PROFILE",
  ] as const;
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      original[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });

  it("resolves local-dev when nothing is set", () => {
    const config = loadSidearmConfig();
    expect(config.profile).toBe("local-dev");
    expect(config.modelId).toBe("composer-2.5");
  });

  it("resolves cloud-env from CURSOR_CLOUD_ENV_NAME", () => {
    process.env.CURSOR_CLOUD_ENV_NAME = "hack-raise-testbed";
    const config = loadSidearmConfig();
    expect(config.profile).toBe("cloud-env");
    expect(config.cloudEnvName).toBe("hack-raise-testbed");
  });

  it("resolves cloud-repo from CURSOR_REPO_URL", () => {
    process.env.CURSOR_REPO_URL = "https://example.com/repo";
    const config = loadSidearmConfig();
    expect(config.profile).toBe("cloud-repo");
    expect(config.repoUrl).toBe("https://example.com/repo");
    expect(config.startingRef).toBe("main");
  });

  it("respects an app-specific profile override env var", () => {
    process.env.CURSOR_REPO_URL = "https://example.com/repo";
    process.env.HACK_RAISE_PROFILE = "local-dev";
    const config = loadSidearmConfig({ profileOverrideEnv: "HACK_RAISE_PROFILE" });
    expect(config.profile).toBe("local-dev");
  });

  it("uses a caller-supplied default model id", () => {
    const config = loadSidearmConfig({ defaultModelId: "auto" });
    expect(config.modelId).toBe("auto");
  });
});
