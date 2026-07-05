import type { CloudAgentOptions } from "@cursor/sdk";
import type { CloudProfile, SidearmConfig } from "./types.js";

/**
 * Translates a resolved CloudProfile into the SDK's CloudAgentOptions shape.
 * Pure mapping — no env reads, no side effects — so it is trivially testable
 * and safe to call speculatively (e.g. from an env-check) without side effects.
 */
export function buildCloudOptions(
  config: SidearmConfig,
  profile: CloudProfile
): CloudAgentOptions {
  if (profile === "cloud-env") {
    if (!config.cloudEnvName) {
      throw new Error("cloudEnvName is required for the cloud-env profile");
    }
    if (config.repoUrl) {
      throw new Error("Do not combine cloud-env with repoUrl (cloud-repo)");
    }
    return {
      env: { type: "cloud", name: config.cloudEnvName },
    };
  }

  if (!config.repoUrl) {
    throw new Error("repoUrl is required for the cloud-repo profile");
  }
  if (config.cloudEnvName) {
    throw new Error("Do not combine cloud-repo with cloudEnvName (cloud-env)");
  }

  return {
    repos: [
      {
        url: config.repoUrl,
        startingRef: config.startingRef ?? "main",
      },
    ],
  };
}

/** Narrows SidearmConfig.profile to a CloudProfile, throwing on "local-dev". */
export function resolveCloudProfile(config: SidearmConfig): CloudProfile {
  if (config.profile === "cloud-env") return "cloud-env";
  if (config.profile === "cloud-repo") return "cloud-repo";
  throw new Error(`Profile "${config.profile}" is not a cloud profile`);
}
