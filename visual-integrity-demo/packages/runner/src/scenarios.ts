import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Browser, Page } from "playwright";
import { chromium } from "playwright";
import type { BugFinding, RunArtifact, ScenarioRun } from "@hack-raise/graph-core";
import type { ScenarioSpec } from "@hack-raise/graph-core";
import {
  buildFinding,
  finalizeScenarioRun,
  getUserForRole,
  registerFileArtifact,
  writeArtifact,
} from "./config.js";
import type { RunnerConfig } from "./config.js";

export async function runScenario(
  browser: Browser,
  config: RunnerConfig,
  baseUrl: string,
  scenario: ScenarioSpec
): Promise<ScenarioRun> {
  const startedAt = new Date().toISOString();
  const context = await browser.newContext({
    extraHTTPHeaders: {
      "x-hack-raise-run-id": config.runId,
      "x-hack-raise-scenario-id": scenario.scenarioId,
      "x-hack-raise-role": scenario.role,
    },
  });
  const page = await context.newPage();
  const artifacts: RunArtifact[] = [];
  const findings: BugFinding[] = [];
  const events: string[] = [];
  const consoleLogs: string[] = [];
  const networkFailures: string[] = [];
  const tracePath = path.join(
    config.artifactDir,
    config.runId,
    scenario.scenarioId,
    "trace.zip"
  );

  await context.tracing.start({ screenshots: true, snapshots: true });

  page.on("console", (msg) => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on("pageerror", (err) => {
    events.push(`pageerror: ${err.message}`);
  });
  page.on("requestfailed", (req) => {
    networkFailures.push(`${req.method()} ${req.url()} :: ${req.failure()?.errorText}`);
  });

  try {
    await login(page, baseUrl, scenario);
    events.push(`logged_in:${scenario.role}`);

    switch (scenario.scenarioId) {
      case "user-dashboard-next":
        await runDashboardNext(page, baseUrl, config, artifacts, findings);
        break;
      case "user-admin-authz":
        await runAdminAuthz(page, baseUrl, config, artifacts, findings, consoleLogs);
        break;
      case "user-task-create":
        await runTaskCreate(page, baseUrl, config, artifacts, findings, networkFailures);
        break;
      case "user-broken-link":
        await runBrokenLink(page, baseUrl, config, artifacts, findings);
        break;
      default:
        throw new Error(`No handler for scenario ${scenario.scenarioId}`);
    }

    const eventsPath = path.join(
      config.artifactDir,
      config.runId,
      scenario.scenarioId,
      "events.jsonl"
    );
    await mkdir(path.dirname(eventsPath), { recursive: true });
    await writeFile(eventsPath, events.join("\n"));
    artifacts.push(
      await writeArtifact(
        config.artifactDir,
        config.runId,
        scenario.scenarioId,
        "events",
        "events.jsonl",
        events.join("\n"),
        "application/x-ndjson"
      )
    );

    await mkdir(path.dirname(tracePath), { recursive: true });
    await context.tracing.stop({ path: tracePath });
    artifacts.push(
      await registerFileArtifact(
        config.artifactDir,
        config.runId,
        scenario.scenarioId,
        "trace",
        "trace.zip",
        tracePath,
        "application/zip"
      )
    );

    const status = findings.length > 0 ? "failed" : "passed";
    return finalizeScenarioRun({
      scenarioId: scenario.scenarioId,
      role: scenario.role,
      baseUrl,
      status,
      findings,
      artifacts,
      eventsPath,
      startedAt,
      finishedAt: new Date().toISOString(),
    });
  } finally {
    await context.close();
  }
}

async function login(page: Page, baseUrl: string, scenario: ScenarioSpec) {
  const user = getUserForRole(scenario.role);
  await page.goto(`${baseUrl}${scenario.startPath}`);
  await page.fill("#email", user.email);
  await page.fill("#password", user.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|projects|admin)/);
}

async function runDashboardNext(
  page: Page,
  baseUrl: string,
  config: RunnerConfig,
  artifacts: RunArtifact[],
  findings: BugFinding[]
) {
  await page.goto(`${baseUrl}/dashboard`);
  await page.getByTestId("continue-setup").click();
  await page.waitForTimeout(500);
  const screenshot = path.join(
    config.artifactDir,
    config.runId,
    "user-dashboard-next",
    "dashboard-after-click.png"
  );
  await mkdir(path.dirname(screenshot), { recursive: true });
  await page.screenshot({ path: screenshot, fullPage: true });
  artifacts.push(
    await writeArtifact(
      config.artifactDir,
      config.runId,
      "user-dashboard-next",
      "screenshot",
      "dashboard-after-click.png",
      await readFile(screenshot),
      "image/png"
    )
  );

  const url = page.url();
  const screenshotArtifact = artifacts.at(-1);
  if (!url.includes("/projects") && screenshotArtifact) {
    findings.push(
      buildFinding(
        "BUG_NEXT_INERT",
        [screenshotArtifact.artifactId],
        `Expected navigation to /projects, stayed at ${url}`
      )
    );
  }
}

async function runAdminAuthz(
  page: Page,
  baseUrl: string,
  config: RunnerConfig,
  artifacts: RunArtifact[],
  findings: BugFinding[],
  consoleLogs: string[]
) {
  await page.goto(`${baseUrl}/admin/users`);
  const leak = page.getByTestId("authz-leak");
  await leak.waitFor({ state: "visible" });
  const screenshot = path.join(
    config.artifactDir,
    config.runId,
    "user-admin-authz",
    "admin-leak.png"
  );
  await mkdir(path.dirname(screenshot), { recursive: true });
  await page.screenshot({ path: screenshot, fullPage: true });
  artifacts.push(
    await writeArtifact(
      config.artifactDir,
      config.runId,
      "user-admin-authz",
      "screenshot",
      "admin-leak.png",
      await readFile(screenshot),
      "image/png"
    )
  );
  artifacts.push(
    await writeArtifact(
      config.artifactDir,
      config.runId,
      "user-admin-authz",
      "console_log",
      "console.log",
      consoleLogs.join("\n"),
      "text/plain"
    )
  );
  findings.push(
    buildFinding(
      "BUG_ADMIN_AUTHZ",
      artifacts.map((a) => a.artifactId),
      "Non-admin user can view admin users page"
    )
  );
}

async function runTaskCreate(
  page: Page,
  baseUrl: string,
  config: RunnerConfig,
  artifacts: RunArtifact[],
  findings: BugFinding[],
  networkFailures: string[]
) {
  await page.goto(`${baseUrl}/projects/alpha/tasks/new`);
  await page.fill("#title", "Verify checkout flow");
  await page.fill("#description", "Run smoke test on staging.");
  const responsePromise = page.waitForResponse((res) =>
    res.url().includes("/api/projects/alpha/tasks")
  );
  await page.click('button[type="submit"]');
  const response = await responsePromise;
  networkFailures.push(`${response.status()} ${response.url()}`);
  await page.getByTestId("task-error").waitFor({ state: "visible" });
  const screenshot = path.join(
    config.artifactDir,
    config.runId,
    "user-task-create",
    "task-error.png"
  );
  await mkdir(path.dirname(screenshot), { recursive: true });
  await page.screenshot({ path: screenshot, fullPage: true });
  artifacts.push(
    await writeArtifact(
      config.artifactDir,
      config.runId,
      "user-task-create",
      "screenshot",
      "task-error.png",
      await readFile(screenshot),
      "image/png"
    )
  );
  artifacts.push(
    await writeArtifact(
      config.artifactDir,
      config.runId,
      "user-task-create",
      "network_log",
      "network.log",
      networkFailures.join("\n"),
      "text/plain"
    )
  );
  if (response.status() === 500) {
    findings.push(
      buildFinding(
        "BUG_TASK_CREATE_500",
        artifacts.map((a) => a.artifactId),
        "Task creation returned HTTP 500"
      )
    );
  }
}

async function runBrokenLink(
  page: Page,
  baseUrl: string,
  config: RunnerConfig,
  artifacts: RunArtifact[],
  findings: BugFinding[]
) {
  await page.goto(`${baseUrl}/projects`);
  await page.getByTestId("open-beta-project").click();
  await page.waitForLoadState("networkidle");
  const url = page.url();
  const screenshot = path.join(
    config.artifactDir,
    config.runId,
    "user-broken-link",
    "broken-link.png"
  );
  await mkdir(path.dirname(screenshot), { recursive: true });
  await page.screenshot({ path: screenshot, fullPage: true });
  const shotArtifact = await writeArtifact(
    config.artifactDir,
    config.runId,
    "user-broken-link",
    "screenshot",
    "broken-link.png",
    await readFile(screenshot),
    "image/png"
  );
  artifacts.push(shotArtifact);
  const pageText = await page.locator("body").innerText();
  if (url.includes("missing-id") || pageText.includes("404")) {
    findings.push(
      buildFinding(
        "BUG_BROKEN_PROJECT_LINK",
        [shotArtifact.artifactId],
        `Broken link landed at ${url}`
      )
    );
  }
}

export async function launchBrowser() {
  return chromium.launch({ headless: true });
}
