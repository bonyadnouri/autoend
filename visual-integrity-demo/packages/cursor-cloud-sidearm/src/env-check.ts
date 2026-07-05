import { Cursor } from "@cursor/sdk";
import { buildCloudOptions, resolveCloudProfile } from "./cloud-profiles.js";
import type { SidearmConfig, SidearmEnvCheckReport } from "./types.js";

/**
 * Validates a SidearmConfig against the Cursor SDK: the cloud option shape
 * for the resolved profile, and — when an API key is present — that the key
 * authenticates and the preferred model is available. Returns plain data;
 * printing/formatting stays in the app's own env-check CLI so each app can
 * report its own domain-specific details alongside this.
 */
export async function checkSidearmEnvironment(config: SidearmConfig): Promise<SidearmEnvCheckReport> {
  const report: SidearmEnvCheckReport = {
    profile: config.profile,
    apiKeyPresent: Boolean(config.apiKey),
    cloudOptionsOk: false,
  };

  if (config.profile === "cloud-env" || config.profile === "cloud-repo") {
    try {
      buildCloudOptions(config, resolveCloudProfile(config));
      report.cloudOptionsOk = true;
    } catch (error) {
      report.cloudOptionsError = error instanceof Error ? error.message : String(error);
    }
  }

  if (config.apiKey) {
    try {
      const models = await Cursor.models.list({ apiKey: config.apiKey });
      report.apiAuthOk = true;
      report.modelCount = models.length;
      report.preferredModelAvailable = models.some((m) => m.id === config.modelId);
    } catch (error) {
      report.apiAuthOk = false;
      report.apiAuthError = error instanceof Error ? error.message : String(error);
    }
  }

  return report;
}
