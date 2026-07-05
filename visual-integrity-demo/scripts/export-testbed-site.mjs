#!/usr/bin/env node
/**
 * Save a snapshot of the running testpad (testbed) site to exports/testbed-site/.
 * Starts testpad if HACK_RAISE_TESTPAD_BASE_URL is not set.
 */
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const playwrightEntry = path.join(
  ROOT,
  "packages/runner/node_modules/playwright/index.mjs"
);
const { chromium } = await import(pathToFileURL(playwrightEntry).href);
const OUT_DIR = path.join(ROOT, "exports", "testbed-site");
const PORT = Number(process.env.TESTPAD_PORT ?? 3100);
const BASE_URL =
  process.env.HACK_RAISE_TESTPAD_BASE_URL ?? `http://127.0.0.1:${PORT}`;

const USER = { email: "user@example.com", password: "password123" };

const PAGES = [
  { name: "landing", path: "/", auth: false },
  { name: "login", path: "/login", auth: false },
  { name: "dashboard", path: "/dashboard", auth: true },
  { name: "projects", path: "/projects", auth: true },
  { name: "project-alpha", path: "/projects/alpha", auth: true },
  { name: "task-new", path: "/projects/alpha/tasks/new", auth: true },
  { name: "settings", path: "/settings", auth: true },
  { name: "admin-users", path: "/admin/users", auth: true },
];

async function waitForReady(url, timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${url}/__testbed/contract.json`);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Testpad not ready at ${url}`);
}

function startTestpad() {
  return spawn("pnpm", ["--filter", "@hack-raise/testpad", "dev"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
}

async function stopTestpad(child) {
  if (!child?.pid) return;
  const signal = "SIGTERM";
  if (process.platform !== "win32") {
    try {
      process.kill(-child.pid, signal);
    } catch {
      child.kill(signal);
    }
  } else {
    child.kill(signal);
  }
  await new Promise((r) => setTimeout(r, 2000));
}

async function login(page) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByLabel("Email").fill(USER.email);
  await page.getByLabel("Password").fill(USER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/);
}

function slugPath(pagePath) {
  return pagePath.replace(/^\//, "").replace(/\//g, "_") || "root";
}

async function main() {
  const startedLocally = !process.env.HACK_RAISE_TESTPAD_BASE_URL;
  let child = null;

  if (startedLocally) {
    console.log(`Starting testpad on ${BASE_URL}...`);
    child = startTestpad();
    child.stdout?.on("data", (d) => process.stdout.write(d));
    child.stderr?.on("data", (d) => process.stderr.write(d));
    await waitForReady(BASE_URL);
  }

  await mkdir(OUT_DIR, { recursive: true });

  const contractRes = await fetch(`${BASE_URL}/__testbed/contract.json`);
  const contract = await contractRes.json();
  await writeFile(
    path.join(OUT_DIR, "contract.json"),
    JSON.stringify(contract, null, 2)
  );

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  let loggedIn = false;

  try {
    for (const entry of PAGES) {
      if (entry.auth && !loggedIn) {
        await login(page);
        loggedIn = true;
      } else if (!entry.auth) {
        await context.clearCookies();
      }

      const url = `${BASE_URL}${entry.path}`;
      console.log(`Saving ${entry.name} (${url})...`);
      await page.goto(url, { waitUntil: "networkidle" });

      const baseName = entry.name;
      await page.screenshot({
        path: path.join(OUT_DIR, `${baseName}.png`),
        fullPage: true,
      });
      const html = await page.content();
      await writeFile(path.join(OUT_DIR, `${baseName}.html`), html);
    }

    await writeFile(
      path.join(OUT_DIR, "README.md"),
      `# Testbed site snapshot

Static export of the Hack Raise testpad app captured on ${new Date().toISOString()}.

| File | Route |
| --- | --- |
${PAGES.map((p) => `| \`${p.name}.png\` / \`.html\` | \`${p.path}\` |`).join("\n")}
| \`contract.json\` | \`/__testbed/contract.json\` |

**Note:** HTML snapshots are rendered pages, not a standalone offline app. API routes and auth still require the Next.js server at \`apps/testpad\`.

Source app: \`apps/testpad\`  
Re-export: \`node scripts/export-testbed-site.mjs\`
`
    );

    console.log(`\nSaved to ${OUT_DIR}`);
  } finally {
    await browser.close();
    if (startedLocally) await stopTestpad(child);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
