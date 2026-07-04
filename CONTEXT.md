# autoend

A publishable product (package/plugin — exact form TBD) that anyone can install to get agent-powered end-to-end testing for their web app. The user initiates a Run and walks away; dynamically spawned agents generate and execute e2e tests on the fly; the user gets Reports back and acts on them. Not an internal test suite; the consumer is a third-party developer.

## Language

**autoend**:
The product itself — installable tooling that gives a web app agent-powered e2e testing.
_Avoid_: "the project", "the framework" (until we decide it is one)

**Run**:
A single user-initiated autonomous testing session: agents re-verify known Flows from the Flow Map, explore new surface, and emit Reports. The user does not steer a Run while it executes.
_Avoid_: session, sweep, job

**Flow**:
A user-meaningful path through the app that can be executed and verified (e.g., "a shopper completes checkout").
_Avoid_: test, test case, scenario, user journey

**Flow Map**:
The persistent record of every Flow agents have discovered and successfully executed. Flows enter automatically — no human approval. The map records what demonstrably worked (a baseline), not what should work (a spec); it grows across Runs and makes Reports comparable run-to-run. It lives with the Target's codebase and versions with it — a branch carries its own baseline.
_Avoid_: test suite, coverage map, approved flows

**Report**:
The interactive, video-backed record of a Run, reviewed in a browser: the user clicks through Findings and watches what the agents did. It records the Flows the Run verified, not only the Findings — an all-clear Report still shows what was checked. Not a document. A Report is self-contained and portable — it can be viewed anywhere, but resolution actions (Dismiss, Reject, Suppress) only work where the Flow Map lives.
_Avoid_: results, output, summary, markdown report

**Finding**:
A single item in a Report that asks for the user's attention. Three kinds: a Hard Failure (objective error — 4xx/5xx, crash, console error), a Regression (a Flow in the Flow Map that stopped working), or an Advisory (agent judgment — UX, accessibility, performance).
_Avoid_: issue, bug (a Finding may not be a bug), error

**Diagnosis**:
The filing agent's judgment attached to a Finding: root cause, fault domain (app, test, or environment), and confidence. Optional — its depth scales with Effort, and a Finding without one is still valid.
_Avoid_: analysis, RCA, triage, verdict

**Reject**:
A user action on a Healed finding declaring the heal wrong: the Flow's steps revert to their pre-heal version and the finding is refiled as a Regression. Performed from within the Report.
_Avoid_: undo, revert (those describe the mechanism, not the judgment)

**Suppress**:
A user action on an Advisory finding: future Runs stop re-reporting that same advisory. Unlike Dismiss, nothing is deleted from the Flow Map.
_Avoid_: dismiss (reserved for Regressions), ignore, mute

**Effort**:
The user-chosen depth preset for a Run (low → ultra, à la Claude's effort levels). Effort bounds exploration only — replaying the whole Flow Map always completes at any Effort, so Regression claims are never sacrificed to a small budget.
_Avoid_: budget, depth, mode

**Heal**:
An in-place rewrite of a Flow's execution steps after the app changed but the Flow's goal stayed achievable. Heals happen automatically during a Run and appear in the Report under their own tier, with Evidence — they ask the user to verify, not to act.
_Avoid_: fix, repair, self-healing (as a noun)

**Dismiss**:
A user action on a Regression Finding declaring the removal intentional; dismissing deletes the Flow from the Flow Map. Performed from within the Report.
_Avoid_: ignore, mute, snooze (dismissal is permanent map surgery, not silencing)

**Test Account**:
User-supplied credentials for the Target that agents use to log in through the app's own form, shared across the fleet for a Run. OAuth/SSO/MFA Targets are out of scope in v1 and fail early with a clear message.
_Avoid_: login, creds, service account

**Target**:
The app a Run tests, addressed by URL and chosen by the user at Run initiation (a local dev server or a deployed environment). Agents act on the Target for real but never navigate off its origin; picking an environment where real actions are safe remains the user's call.
_Avoid_: environment, SUT, app under test

**Evidence**:
The video recording of an agent executing a Flow, attached to a Finding so the user can watch exactly what happened.
_Avoid_: screenshot, log, trace
