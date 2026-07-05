import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { StandaloneVisualReport } from '../src/visual/standalone-report.js';
import { renderStandaloneViewerHtml } from '../src/visual/standalone-viewer.js';
import { componentLabelFromArtifact, ruleRelatesToArtifact } from '../src/visual/rule-artifacts.js';

const BATCH_ROOT =
  '/Users/moiz/Documents/code/hack-raise-visual-integrity/apps/autoend/.visual-integrity/demo-runs/batch-2026-07-05T01-43-03-437Z';

const manifest = JSON.parse(await readFile(join(BATCH_ROOT, 'manifest.json'), 'utf8')) as {
  targets: Array<{ slug: string; label: string }>;
};

function patchContractOverlays(report: StandaloneVisualReport): void {
  report.overlays = report.overlays.filter((o) => o.source !== 'design-contract');
  for (const violation of report.violations) {
    violation.evidenceOverlayIds = (violation.evidenceOverlayIds ?? []).filter((id) => !id.startsWith('rule-'));
  }
  let seq = 0;
  for (const artifact of report.expectedArtifacts ?? []) {
    const violation = report.violations.find((v) => ruleRelatesToArtifact(v.ruleId, artifact.id));
    if (!violation) continue;
    const id = `rule-${(seq += 1)}`;
    report.overlays.unshift({
      id,
      source: 'design-contract',
      label: componentLabelFromArtifact(artifact.label),
      box: artifact.box,
      severity: violation.severity,
      rationale: `Expected by ${violation.ruleId}: ${violation.expected}`,
    });
    violation.evidenceOverlayIds.push(id);
  }
}

for (const target of manifest.targets) {
  const dir = join(BATCH_ROOT, target.slug);
  const reportPath = join(dir, 'report.json');
  const report = JSON.parse(await readFile(reportPath, 'utf8')) as StandaloneVisualReport;
  patchContractOverlays(report);
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  await writeFile(join(dir, 'index.html'), renderStandaloneViewerHtml(report));
  console.log(`refreshed ${target.label}`);
}
