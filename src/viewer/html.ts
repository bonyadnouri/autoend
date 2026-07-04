/**
 * The Report page (ADR-0004: thin viewer over the static Run artifact).
 * Single file, zero external assets — must render offline. Design direction:
 * forensic terminal dossier. The page answers "did anything break?" in the
 * first glance (the verdict), then presents Evidence per tier.
 */
export const VIEWER_HTML = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>autoend Report</title>
<style>
  :root {
    --bg: #0a0d12;
    --surface: #10141c;
    --line: #1d2432;
    --ink: #dce3ef;
    --dim: #6d7890;
    --hard: #ff5c5c;
    --regression: #f2a53f;
    --heal: #38cfc0;
    --advisory: #8f7ff0;
    --ok: #56d68b;
    --mono: ui-monospace, "SFMono-Regular", "Cascadia Code", "JetBrains Mono", Menlo, Consolas, monospace;
  }
  * { box-sizing: border-box; margin: 0; }
  html { color-scheme: dark; }
  body {
    background:
      radial-gradient(1200px 500px at 50% -10%, #131a26 0%, transparent 60%),
      repeating-linear-gradient(0deg, transparent 0 47px, #ffffff05 47px 48px),
      repeating-linear-gradient(90deg, transparent 0 47px, #ffffff05 47px 48px),
      var(--bg);
    color: var(--ink);
    font-family: var(--mono);
    font-size: 14px;
    line-height: 1.55;
    min-height: 100vh;
  }
  main { max-width: 66rem; margin: 0 auto; padding: 0 1.5rem 6rem; }

  header {
    display: flex; justify-content: space-between; align-items: baseline;
    padding: 1.1rem 0; border-bottom: 1px solid var(--line);
    font-size: 11px; letter-spacing: .18em; text-transform: uppercase; color: var(--dim);
  }
  header .brand b { color: var(--ink); font-weight: 700; }

  .verdict { padding: 3.2rem 0 0; animation: rise .5s ease-out both; }
  .verdict h1 {
    font-size: clamp(2rem, 5.4vw, 3.4rem);
    font-weight: 800; letter-spacing: .01em; line-height: 1.1;
    display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;
  }
  .lamp {
    width: .6em; height: .6em; border-radius: 50%;
    background: var(--verdict-color, var(--ok));
    box-shadow: 0 0 18px var(--verdict-color, var(--ok));
    animation: pulse 2.4s ease-in-out infinite;
  }
  .verdict .sub { margin-top: .9rem; color: var(--dim); font-size: 13px; }
  .verdict .sub b { color: var(--ink); font-weight: 600; }

  .stats {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
    gap: 1px; background: var(--line); border: 1px solid var(--line);
    margin-top: 2.6rem; animation: rise .5s .08s ease-out both;
  }
  .stat { background: var(--surface); padding: .9rem 1rem .8rem; position: relative; }
  .stat::before {
    content: ""; position: absolute; inset: 0 auto auto 0; height: 2px; width: 100%;
    background: var(--stat-color, transparent);
  }
  .stat .n { font-size: 1.7rem; font-weight: 800; }
  .stat .l { font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: var(--dim); }
  .stat.zero .n { color: var(--dim); }

  section { margin-top: 3.4rem; animation: rise .5s ease-out both; }
  section:nth-of-type(1) { animation-delay: .14s }
  section:nth-of-type(2) { animation-delay: .20s }
  section:nth-of-type(3) { animation-delay: .26s }
  section:nth-of-type(4) { animation-delay: .32s }
  section h2 {
    font-size: 12px; letter-spacing: .2em; text-transform: uppercase;
    display: flex; align-items: baseline; gap: .7rem;
  }
  section h2::before { content: "▮"; color: var(--tier); }
  section h2 .count { color: var(--tier); }
  section .explain { color: var(--dim); font-size: 12.5px; margin: .45rem 0 1.2rem; max-width: 44rem; }

  .card {
    border: 1px solid var(--line); border-left: 3px solid var(--tier);
    background: var(--surface); padding: 1.1rem 1.25rem 1.25rem; margin-bottom: 1rem;
  }
  .card h3 { font-size: 15px; font-weight: 700; }
  .card .detail {
    color: var(--dim); font-size: 12.5px; margin-top: .4rem;
    white-space: pre-wrap; word-break: break-word;
  }
  .card video {
    width: 100%; margin-top: 1rem; border: 1px solid var(--line);
    background: #000; display: block;
  }
  .card .flowid { color: var(--dim); font-size: 11px; margin-top: .55rem; letter-spacing: .06em; }

  .allclear { text-align: center; padding: 5rem 0 2rem; animation: rise .5s .14s ease-out both; }
  .allclear .mark { font-size: 3rem; color: var(--ok); }
  .allclear h2 { font-size: 1.5rem; letter-spacing: .3em; text-transform: uppercase; margin-top: 1rem; }
  .allclear p { color: var(--dim); margin-top: .8rem; }

  footer {
    margin-top: 5rem; padding-top: 1rem; border-top: 1px solid var(--line);
    color: var(--dim); font-size: 11px; letter-spacing: .08em;
    display: flex; justify-content: space-between; flex-wrap: wrap; gap: .5rem;
  }

  @keyframes rise { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
  @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: .55 } }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important } }
</style>
</head>
<body>
<main>
  <header>
    <span class="brand"><b>autoend</b> ⁄ run report</span>
    <span id="runid"></span>
  </header>
  <div class="verdict" id="verdict"></div>
  <div class="stats" id="stats"></div>
  <div id="body"></div>
  <footer>
    <span>evidence recorded headless during the run</span>
    <span id="stamp"></span>
  </footer>
</main>
<script>
const TIERS = {
  'hard-failure': {
    label: 'Hard failures', color: 'var(--hard)',
    explain: 'Objectively broken — errors, crashes, failed requests. Fix these first.',
  },
  'regression': {
    label: 'Regressions', color: 'var(--regression)',
    explain: 'Worked in a previous run, failed in this one. If the removal was intentional, dismiss it to update the baseline.',
  },
  'heal': {
    label: 'Heals', color: 'var(--heal)',
    explain: 'The UI changed but the goal still works — the flow script was rewritten. Watch each video to confirm the heal is right.',
  },
  'advisory': {
    label: 'Advisories', color: 'var(--advisory)',
    explain: 'Agent judgment on UX, accessibility, and speed. Signals worth a look, not verdicts.',
  },
};

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'style') node.style.cssText = v; else if (k === 'text') node.textContent = v; else node.setAttribute(k, v);
  }
  for (const child of children || []) node.appendChild(child);
  return node;
}

fetch('/api/report').then(r => r.json()).then(report => {
  const byTier = { 'hard-failure': [], 'regression': [], 'heal': [], 'advisory': [] };
  for (const f of report.findings) (byTier[f.kind] || byTier['advisory']).push(f);
  for (const h of report.heals) byTier['heal'].push({ title: 'Flow "' + h.flowId + '" healed', detail: h.summary, flowId: h.flowId, evidence: h.evidence });

  const nHard = byTier['hard-failure'].length, nReg = byTier['regression'].length;
  const nHeal = byTier['heal'].length, nAdv = byTier['advisory'].length;

  document.getElementById('runid').textContent = report.runId;
  document.getElementById('stamp').textContent = 'effort ' + report.effort + ' · ' + report.startedAt;

  const durationS = report.finishedAt
    ? ((new Date(report.finishedAt) - new Date(report.startedAt)) / 1000).toFixed(1) + 's'
    : '—';

  let text, color;
  if (nHard > 0) { text = nHard + ' hard failure' + (nHard > 1 ? 's' : ''); color = 'var(--hard)'; }
  else if (nReg > 0) { text = nReg + ' regression' + (nReg > 1 ? 's' : ''); color = 'var(--regression)'; }
  else if (nHeal > 0) { text = 'passing, ' + nHeal + ' heal' + (nHeal > 1 ? 's' : '') + ' to verify'; color = 'var(--heal)'; }
  else { text = 'all clear'; color = 'var(--ok)'; }

  const verdict = document.getElementById('verdict');
  verdict.style.setProperty('--verdict-color', color);
  verdict.appendChild(el('h1', {}, [el('span', { class: 'lamp' }), el('span', { text })]));
  const sub = el('div', { class: 'sub' });
  sub.innerHTML = 'target <b></b> · <b>' + report.flowsReplayed + '</b> flows replayed · <b>'
    + report.flowsDiscovered + '</b> discovered · <b>' + durationS + '</b>';
  sub.querySelector('b').textContent = report.target;
  verdict.appendChild(sub);

  const stats = document.getElementById('stats');
  for (const [kind, tier] of Object.entries(TIERS)) {
    const n = byTier[kind].length;
    stats.appendChild(el('div', { class: 'stat' + (n === 0 ? ' zero' : ''), style: '--stat-color:' + (n > 0 ? tier.color : 'transparent') }, [
      el('div', { class: 'n', text: String(n) }),
      el('div', { class: 'l', text: tier.label }),
    ]));
  }

  const body = document.getElementById('body');

  // Interaction map (#16): states the Run visited and the navigations between
  // them, clustered so URLs for the same screen share one node.
  if (report.graph && report.graph.nodes.length > 0) {
    const g = report.graph;
    const section = el('section', { style: '--tier: var(--heal)' });
    section.appendChild(el('h2', {}, [
      el('span', { text: 'Interaction map ' }),
      el('span', { class: 'count', text: g.nodes.length + ' states' }),
    ]));
    section.appendChild(el('div', { class: 'explain',
      text: 'States visited during the run and the navigations between them. URLs that denote the same screen (e.g. /product/1 and /product/2) are clustered into one node.' }));
    const card = el('div', { class: 'card' });
    if (g.edges.length > 0) {
      for (const e of g.edges) {
        card.appendChild(el('div', { class: 'detail',
          text: e.from + '  —(' + e.action + ')→  ' + e.to + (e.count > 1 ? '  ×' + e.count : '') }));
      }
    } else {
      card.appendChild(el('div', { class: 'detail', text: g.nodes.map((n) => n.id).join('\\n') }));
    }
    section.appendChild(card);
    body.appendChild(section);
  }

  const total = nHard + nReg + nHeal + nAdv;
  if (total === 0) {
    body.appendChild(el('div', { class: 'allclear' }, [
      el('div', { class: 'mark', text: '✓' }),
      el('h2', { text: 'all clear' }),
      el('p', { text: report.flowsReplayed > 0
        ? 'Every known flow replayed successfully. Nothing to act on.'
        : 'No flows in the map yet — the first exploration run will build your baseline.' }),
    ]));
    return;
  }

  for (const [kind, tier] of Object.entries(TIERS)) {
    const items = byTier[kind];
    if (items.length === 0) continue;
    const section = el('section', { style: '--tier:' + tier.color });
    section.appendChild(el('h2', {}, [
      el('span', { text: tier.label + ' ' }),
      el('span', { class: 'count', text: String(items.length) }),
    ]));
    section.appendChild(el('div', { class: 'explain', text: tier.explain }));
    for (const f of items) {
      const card = el('div', { class: 'card' }, [el('h3', { text: f.title })]);
      if (f.detail) card.appendChild(el('div', { class: 'detail', text: f.detail }));
      if (f.evidence) card.appendChild(el('video', { controls: '', preload: 'metadata', src: '/evidence/' + f.evidence }));
      if (f.flowId) card.appendChild(el('div', { class: 'flowid', text: 'flow: ' + f.flowId }));
      section.appendChild(card);
    }
    body.appendChild(section);
  }
});
</script>
</body>
</html>`;
