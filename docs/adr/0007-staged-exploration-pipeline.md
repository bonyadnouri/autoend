# Deep exploration is a staged pipeline of capability-separated roles

At high Effort and above, a Run's exploration phase is no longer N parallel single-shot lens explorers; it is a staged pipeline. **Recon** reads the Target's checkout and product docs — never the live app — and produces a persistent Product Brief. **Persona Waves** follow: browser-holding explorers, each a fixed archetype (naive newcomer, task-driven professional, domain power user, adversarial prober, accessibility-minded user) instantiated with product-specific Missions from the Brief. Verification and triage close the pipeline (ADR-0008). Effort selects the pipeline's *shape*, not just its duration: low and mid keep today's fast single-pass smoke run (the sub-60s default onboarding path survives); high runs Recon → missioned Personas → Verifier → Triage in a single Wave; xhigh and ultra add a second, lead-seeded Wave and larger casts. Per-stage budgets are tuned from benchmark data (ADR-0009), not guessed.

The fleet is capability-separated so no agent ever holds untrusted web content and repo access at once: Personas get a browser and a Mission brief, nothing else — today's filesystem firewall and origin fence stay; Recon gets the repo and docs but no browser; Triage gets git history and read-only GitHub (`gh`) but no browser.

Coordination is upfront and dead-drop, not live: Recon assigns non-overlapping Missions (it knows the surface from the repo), and explorers stay independent in flight. Depth compounds through **Leads** — every explorer reports suspicious-but-unconfirmed observations and unexplored territory; the best Leads seed Wave two, and unconsumed Leads persist in a ledger that seeds the next Run's Missions.

The Product Brief and the Lead ledger live in `.autoend/` beside the Flow Map — accumulated knowledge versions with the codebase; a branch carries its own understanding. The Brief regenerates only when stale (HEAD moved significantly, docs changed, or an age cap).

## Considered Options

Pipeline scope:

- **Rich pipeline at every Effort** — rejected: low effort becomes a worse version of everything and the sub-60s zero-setup demo dies.
- **A separate `hunt` command** — rejected: forks the pipeline, the Report, and the Flow Map story; the goal was richer Runs, not a second product.
- **Keep single-shot explorers, raise budgets, polish prompts** — rejected: the shallowness is architectural (no product knowledge, no semantic oracle, no intent research), not rhetorical.

Knowledge access:

- **Explorers get browser + repo + web in one agent** — rejected: any page the agent reads can instruct it to exfiltrate source (prompt-injection → repo), and each explorer burns tokens re-deriving the same understanding.
- **URL-only purism** — rejected: cannot satisfy intent research (git log, issues) at all.
- **Repo yes, live GitHub no** — rejected: loses known-issue matching, an explicit requirement.

Personas:

- **Fixed rich roster shipped with autoend** — rejected: "pro user" stays product-blind, which was the original complaint.
- **Pure recon-generated cast** — rejected: no diversity guarantee; can collapse into five variations of the same power user.
- **User-defined personas in config** — rejected: violates zero-setup autonomy (ADR-0001), and for the benchmark we would be hand-feeding the answers.

Coordination:

- **Independent agents with better prompts** — rejected: duplication persists and a bug smelled at the deadline dies with its finder.
- **Live shared blackboard** — rejected: race-prone, irreproducible, and a prompt-injection channel between agents.
- **Sequential relay** — rejected: serializes the Run; parallelism was the point.

Persistence:

- **Everything ephemeral** — rejected: every deep Run re-pays recon and the fleet never gets smarter about the product.

## Consequences

- Deep Runs are slow and expensive by design: ultra against a Grafana-class Target legitimately takes 30–60 minutes with strong models throughout (ADR-0009). The Effort glossary rule is preserved — replay always completes; only exploration pays.
- The Product Brief is load-bearing: a wrong or stale Brief misleads the whole fleet. Staleness rules need tuning, and the benchmark should include a stale-brief scenario.
- Two new persisted files in `.autoend/` (Product Brief, Lead ledger) version with the codebase like the Flow Map.
- Deep-Wave explorer prompts drop "report early rather than perfectly": a starved explorer reports Leads (the scent), not rushed conclusions.
- `effort.ts` budgets become per-stage and are retuned from benchmark data.
- The Run artifact grows schema surface (personas, missions, waves, leads); the viewer's hand-kept type mirror must be updated in step — coordinate with the viewer team before landing.
