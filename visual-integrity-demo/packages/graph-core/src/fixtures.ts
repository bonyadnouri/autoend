import type {
  ScenarioSpec,
  SeededBug,
  TestbedContract,
} from "./schemas.js";

export const SEEDED_BUGS: SeededBug[] = [
  {
    bugId: "BUG_NEXT_INERT",
    route: "/dashboard",
    trigger: 'Click "Continue setup"',
    expectedBehavior: "Navigate to /projects",
    actualBehavior: "Button does nothing; URL stays on /dashboard",
    requiredArtifacts: ["screenshot", "trace"],
  },
  {
    bugId: "BUG_ADMIN_AUTHZ",
    route: "/admin/users",
    trigger: "Normal user navigates directly to /admin/users",
    expectedBehavior: "Forbidden or redirect for non-admin",
    actualBehavior: "Admin users page visible to normal user",
    requiredArtifacts: ["screenshot", "console_log"],
  },
  {
    bugId: "BUG_TASK_CREATE_500",
    route: "/projects/alpha/tasks/new",
    trigger: "Submit valid task form",
    expectedBehavior: "Task created and success shown",
    actualBehavior: "API returns deterministic 500",
    requiredArtifacts: ["screenshot", "network_log"],
  },
  {
    bugId: "BUG_BROKEN_PROJECT_LINK",
    route: "/projects",
    trigger: 'Click "Open Beta project"',
    expectedBehavior: "Navigate to /projects/beta",
    actualBehavior: "Navigates to /projects/missing-id or 404",
    requiredArtifacts: ["screenshot", "trace"],
  },
];

export const SCENARIOS: ScenarioSpec[] = [
  {
    scenarioId: "user-dashboard-next",
    role: "user",
    startPath: "/login",
    steps: [
      "Login as user@example.com",
      "Go to dashboard",
      'Click "Continue setup"',
    ],
    expectedFindings: ["BUG_NEXT_INERT"],
  },
  {
    scenarioId: "user-admin-authz",
    role: "user",
    startPath: "/login",
    steps: ["Login as user@example.com", "Navigate to /admin/users"],
    expectedFindings: ["BUG_ADMIN_AUTHZ"],
  },
  {
    scenarioId: "user-task-create",
    role: "user",
    startPath: "/login",
    steps: [
      "Login as user@example.com",
      "Open /projects/alpha/tasks/new",
      "Submit task form",
    ],
    expectedFindings: ["BUG_TASK_CREATE_500"],
  },
  {
    scenarioId: "user-broken-link",
    role: "user",
    startPath: "/login",
    steps: [
      "Login as user@example.com",
      "Go to /projects",
      'Click "Open Beta project"',
    ],
    expectedFindings: ["BUG_BROKEN_PROJECT_LINK"],
  },
];

export const TESTPAD_CONTRACT: TestbedContract = {
  version: "1.0.0",
  users: [
    {
      email: "user@example.com",
      password: "password123",
      role: "user",
    },
    {
      email: "admin@example.com",
      password: "admin123",
      role: "admin",
    },
  ],
  routes: [
    { path: "/", label: "Landing", roles: ["anonymous", "user", "admin"] },
    { path: "/login", label: "Login", roles: ["anonymous"] },
    { path: "/dashboard", label: "Dashboard", roles: ["user", "admin"] },
    { path: "/projects", label: "Projects", roles: ["user", "admin"] },
    {
      path: "/projects/alpha",
      label: "Alpha project",
      roles: ["user", "admin"],
    },
    {
      path: "/projects/beta",
      label: "Beta project",
      roles: ["user", "admin"],
    },
    {
      path: "/projects/alpha/tasks/new",
      label: "Create task",
      roles: ["user", "admin"],
    },
    { path: "/settings", label: "Settings", roles: ["user", "admin"] },
    { path: "/admin/users", label: "Admin users", roles: ["admin"] },
  ],
  seededBugs: SEEDED_BUGS,
  scenarios: SCENARIOS,
};

export function getScenarioById(id: string): ScenarioSpec | undefined {
  return SCENARIOS.find((s) => s.scenarioId === id);
}
