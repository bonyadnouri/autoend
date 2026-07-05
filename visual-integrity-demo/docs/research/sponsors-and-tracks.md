# RAISE Hackathon — tracks & side prizes

> Ground truth: participant PDF in `docs/sponsors/`. Bonus prize eligibility for NVIDIA/SUSE/Azure/etc. was **not** fully documented in public materials — confirm with Discord / sponsor reps.

## Main tracks (must fit at least one)

| Track | Requirement summary |
|-------|---------------------|
| **Cursor** | Real workflow problem; thoughtful UX/journey; design & interactivity |
| **Vultr** | Web enterprise **agent** grounded in documents; multi-step plan/retrieve/tools/decisions |
| **Crusoe** | Agent on Crusoe Managed Inference; live situational model from streaming inputs |
| **Google DM In-Person** | Load-bearing primitive: Computer Use, Antigravity state, or Live Translate |
| **Google DM Remote** | Edge/on-device app running **Gemma** locally |

## Track prizes (from participant PDF)

- **Cursor:** $30K / $20K / $15K credits + hardware / Lee Robinson chat
- **Vultr:** cash + $1K credits
- **Google DM:** cash (in-person and remote tiers)
- **Crusoe:** Apple gift cards / AirPods + API credits

## Bonus prizes (not separate judged tracks in PDF)

| Partner | Prize | Our integration angle |
|---------|-------|----------------------|
| Microsoft for Startups | $200K Azure offer | Only if startup-eligible; optional worker hosting |
| **NVIDIA** | RTX 5080 | Nemotron via build.nvidia.com for evidence reasoning |
| Cloudflare | $5K credit | Pages/R2/Workers for dashboard + artifacts |
| Nebius | $25K credit | GPU inference if confirmed at event |
| OpenRouter | $5K credit | Model router fallback |
| **SUSE** | $2.5K training | Open-source / container story |
| Gradium | 145K credits (event) | Optional narrated demo |
| Mozilla Otari | $5 credit | LLM gateway |

## Tech sponsors (LinkedIn / public mentions)

Mozilla (gold), Gradium, **SUSE**, ai71, Grafana Labs, SemiAnalysis — use only where load-bearing.

## Grafana side track (from sponsor deck)

- Thesis: **feedback-loop speed** = monitoring + observability + reliability
- LGTM: **Loki** (logs), **Tempo** (traces), **Mimir** (metrics), **Grafana** UI
- **Alloy + OpenTelemetry** as collector plumbing
- **gcx** — CLI/agent control plane for Grafana data (`github.com/grafana/gcx`)
- Demo hook: trace-guided fix; "give your agent evidence, not vibes"

## NVIDIA side track (from Nemotron deck)

- Open models for **agentic AI**: Nano / Super / Ultra
- VL, Parse, Page Elements for document/UI understanding
- Safety models (jailbreak, topic control)
- Quick start: **build.nvidia.com** → API key → model call
- Demo hook: Nemotron summarizes Playwright + Grafana evidence bundle

## Disqualification risks to avoid

- Dashboard as *main* feature (we're a QA harness with graph replay, not generic BI)
- Basic RAG, Streamlit-only, etc. (see full rules in PDF)
