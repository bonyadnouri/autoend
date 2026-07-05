# Testbed options

## Recommended: dual testbed

### 1. Local `apps/testpad` (primary for hackathon demo)

**Why:** Full control over known bugs, fast startup, deterministic credentials.

**Flows:**

- User: landing → login → dashboard → projects → detail → create task → settings
- Admin: login → admin dashboard → users → invite → audit → billing

**Intentional bugs:**

- Next button does nothing → unreachable route in code graph
- Hidden route in code, no UI path
- Admin page reachable by normal user
- Form with failing network request
- Console error on one route
- Broken dynamic route link
- UI that looks like navigation but doesn't change URL

**Instrumentation:** OpenTelemetry from day one; `runId`, `scenarioId`, `route`, `role` on spans/logs.

### 2. OpenTelemetry Astronomy Shop (advanced / Grafana demo)

**Repo:** https://github.com/open-telemetry/opentelemetry-demo

**Why:** Official microservices demo; **Grafana Labs** fork exists; built-in OTel + Grafana dashboards.

**Known public issues (good for harness demo):**

- Grafana dashboards empty until ~5 min warmup ([#1771](https://github.com/open-telemetry/opentelemetry-demo/issues/1771))
- Grafana missing datasources in some helm versions ([#2904](https://github.com/open-telemetry/opentelemetry-demo/issues/2904))
- OOM on ad, flagd, fraud-detection, kafka ([#3034](https://github.com/open-telemetry/opentelemetry-demo/issues/3034))
- LLM service restart loop at 50M memory ([#2944](https://github.com/open-telemetry/opentelemetry-demo/issues/2944))
- Metrics temporality env not applied → Prometheus rejects metrics ([#2884](https://github.com/open-telemetry/opentelemetry-demo/issues/2884))

**Caveat:** Heavy (Docker Compose, many services). Use for Grafana evidence story, not first-hour MVP.

### Alternatives considered

| Project | Fit | Notes |
|---------|-----|-------|
| playwright-ai-qa-agent / TaskFlow | High | Break modes for locator/logic/auth bugs |
| jerry | Medium | Self-healing demo app |
| paulasilvatech/sre-demo | Medium | Chaos API endpoints, Playwright |
| chaos-maker / chaosbringer | Low as app | Good for injecting faults into tests |

## Grafana internal demo reference

Grafana's hackathon deck references **TNS** (`tns` demo) for trace-guided debugging — align OTel + gcx patterns with that cookbook.
