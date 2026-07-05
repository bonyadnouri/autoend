import { describe, expect, it } from "vitest";
import { buildCloudOptions, resolveCloudProfile } from "../src/cloud-profiles.js";
import type { SidearmConfig } from "../src/types.js";

function config(overrides: Partial<SidearmConfig> = {}): SidearmConfig {
  return {
    modelId: "composer-2.5",
    profile: "local-dev",
    ...overrides,
  };
}

describe("resolveCloudProfile", () => {
  it("returns cloud-env when profile is cloud-env", () => {
    expect(resolveCloudProfile(config({ profile: "cloud-env" }))).toBe("cloud-env");
  });

  it("returns cloud-repo when profile is cloud-repo", () => {
    expect(resolveCloudProfile(config({ profile: "cloud-repo" }))).toBe("cloud-repo");
  });

  it("throws for local-dev", () => {
    expect(() => resolveCloudProfile(config({ profile: "local-dev" }))).toThrow(
      /not a cloud profile/
    );
  });
});

describe("buildCloudOptions", () => {
  it("builds cloud-env options from cloudEnvName", () => {
    const options = buildCloudOptions(
      config({ profile: "cloud-env", cloudEnvName: "hack-raise-testbed" }),
      "cloud-env"
    );
    expect(options).toEqual({ env: { type: "cloud", name: "hack-raise-testbed" } });
  });

  it("throws for cloud-env without cloudEnvName", () => {
    expect(() => buildCloudOptions(config({ profile: "cloud-env" }), "cloud-env")).toThrow(
      /cloudEnvName is required/
    );
  });

  it("throws when cloud-env is combined with repoUrl", () => {
    expect(() =>
      buildCloudOptions(
        config({ profile: "cloud-env", cloudEnvName: "env", repoUrl: "https://example.com/repo" }),
        "cloud-env"
      )
    ).toThrow(/Do not combine cloud-env with repoUrl/);
  });

  it("builds cloud-repo options with startingRef default", () => {
    const options = buildCloudOptions(
      config({ profile: "cloud-repo", repoUrl: "https://example.com/repo" }),
      "cloud-repo"
    );
    expect(options).toEqual({
      repos: [{ url: "https://example.com/repo", startingRef: "main" }],
    });
  });

  it("builds cloud-repo options with an explicit startingRef", () => {
    const options = buildCloudOptions(
      config({ profile: "cloud-repo", repoUrl: "https://example.com/repo", startingRef: "feat/x" }),
      "cloud-repo"
    );
    expect(options.repos?.[0]).toEqual({ url: "https://example.com/repo", startingRef: "feat/x" });
  });

  it("throws for cloud-repo without repoUrl", () => {
    expect(() => buildCloudOptions(config({ profile: "cloud-repo" }), "cloud-repo")).toThrow(
      /repoUrl is required/
    );
  });

  it("throws when cloud-repo is combined with cloudEnvName", () => {
    expect(() =>
      buildCloudOptions(
        config({
          profile: "cloud-repo",
          repoUrl: "https://example.com/repo",
          cloudEnvName: "env",
        }),
        "cloud-repo"
      )
    ).toThrow(/Do not combine cloud-repo with cloudEnvName/);
  });
});
