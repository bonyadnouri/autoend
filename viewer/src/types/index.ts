export type TestStatus = "pass" | "fail" | "not-executed";
export type JourneyStatus = "healthy" | "warning" | "broken";
export type Severity = "critical" | "high" | "medium" | "low";
export type UserRole = "qa" | "developer" | "product-owner";

export interface ExploreOptions {
  recordVideo: boolean;
  captureNetwork: boolean;
  deepAnalysis: boolean;
}

export interface ExploreLaunchState {
  target: string;
  options: ExploreOptions;
}

export type InsightCategory =
  | "missing-functionality"
  | "broken-flow"
  | "ux-inconsistency"
  | "unreachable-screen"
  | "unexpected-navigation"
  | "suggested-improvement";

export type ElementType =
  | "button"
  | "link"
  | "input"
  | "form"
  | "image"
  | "dropdown"
  | "checkbox"
  | "text";

export interface InteractiveElement {
  id: string;
  label: string;
  type: ElementType;
  description: string;
}

export interface NavigationOption {
  label: string;
  targetScreenId: string;
  trigger: string;
}

export interface Screen {
  id: string;
  name: string;
  type: "entry" | "core" | "flow" | "detail" | "utility";
  description: string;
  /** Layout position for the application map graph. */
  position: { x: number; y: number };
  status: JourneyStatus;
  isEntryPoint: boolean;
  elements: InteractiveElement[];
  navigation: NavigationOption[];
  expectedActions: string[];
  testCaseIds: string[];
  issueIds: string[];
  /** Accent color used for the placeholder screenshot. */
  accent: string;
}

export interface ScreenEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  status: "normal" | "warning" | "broken";
}

export interface JourneyStep {
  screenId: string;
  action: string;
}

export interface Journey {
  id: string;
  name: string;
  description: string;
  status: JourneyStatus;
  coverage: number;
  steps: JourneyStep[];
  testCaseIds: string[];
}

export interface TestStep {
  action: string;
  expected: string;
}

export interface TestScenario {
  id: string;
  name: string;
  journeyId: string;
  screenIds: string[];
  preconditions: string[];
  steps: TestStep[];
  expectedResult: string;
  actualResult: string;
  status: TestStatus;
  durationMs: number;
  relatedIssueIds: string[];
  hasInvestigation?: boolean;
}

export type FaultDomain = "frontend" | "backend" | "network" | "data" | "unknown";

export interface FailureAnalysis {
  rootCause: string;
  explanation: string;
  confidence: number;
  faultDomain: FaultDomain;
  nextSteps: string[];
}

export interface ReplayFrame {
  tMs: number;
  screenId: string;
  caption: string;
  marker?: "action" | "failure";
}

export interface Replay {
  durationMs: number;
  frames: ReplayFrame[];
  /** When set, a real <video> is rendered instead of the simulated player. */
  videoUrl?: string | null;
}

export type EvidenceLabel = "Before action" | "After action" | "At failure";

export interface EvidenceShot {
  label: EvidenceLabel;
  screenId: string;
  caption: string;
  tMs: number;
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface NetworkRequest {
  id: string;
  method: HttpMethod;
  endpoint: string;
  status: number;
  durationMs: number;
  failed: boolean;
  tMs: number;
  requestPayload?: string;
  responsePayload?: string;
}

export type LogLevel = "info" | "warn" | "error" | "debug";
export type LogSource = "application" | "console";

export interface LogEntry {
  id: string;
  level: LogLevel;
  source: LogSource;
  tMs: number;
  message: string;
  stack?: string;
}

export type TimelineKind = "navigate" | "action" | "assertion" | "failure";

export interface TimelineStep {
  tMs: number;
  screenId: string;
  label: string;
  kind: TimelineKind;
}

export interface ExpectedActualRow {
  aspect: string;
  expected: string;
  actual: string;
}

export interface Environment {
  device: string;
  os: string;
  appVersion: string;
  orientation: string;
  theme: string;
  network: string;
  timestamp: string;
}

export interface TestInvestigation {
  testId: string;
  recordedReason: string;
  analysis?: FailureAnalysis;
  replay: Replay;
  evidence: EvidenceShot[];
  network: NetworkRequest[];
  logs: LogEntry[];
  timeline: TimelineStep[];
  comparison: ExpectedActualRow[];
  environment: Environment;
}

export interface Insight {
  id: string;
  title: string;
  category: InsightCategory;
  description: string;
  detail: string;
  severity: Severity;
  relatedScreenId?: string;
  relatedJourneyId?: string;
  issueId?: string;
}

export interface Issue {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  relatedScreenId: string;
  relatedJourneyId?: string;
  suggestedFix: string;
  relatedTestIds: string[];
  status: "open" | "acknowledged" | "resolved";
}

export interface AppSummary {
  appName: string;
  appUrl: string;
  analyzedAt: string;
  screensDiscovered: number;
  userFlows: number;
  testsExecuted: number;
  testsPassed: number;
  testsFailed: number;
  testsNotExecuted: number;
  coveragePercent: number;
  criticalIssues: number;
}
