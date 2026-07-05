import type { VisualOverlay, VisualRegion, VisualRuleViolation } from '../report/types.js';
import { componentLabelFromArtifact, ruleRelatesToArtifact } from './rule-artifacts.js';
import type { ExpectedVisualArtifact, VisualCapture } from './types.js';

export interface BuildOverlaysInput {
  capture: VisualCapture;
  expected: ExpectedVisualArtifact[];
  diffRegions: VisualRegion[];
  /** Mutated in place: each violation's evidenceOverlayIds is filled with the overlays that substantiate it. */
  violations: VisualRuleViolation[];
}

/**
 * Assembles VisualOverlay[] from every Tier 0 source (Visual Integrity plan:
 * Visual Wow Factor > Region Layer). Model-sourced overlays (Tier 1/2) are
 * appended separately by analyze.ts — this function only ever produces
 * deterministic overlays, so the demo works with zero API keys.
 */
export function buildDeterministicOverlays(input: BuildOverlaysInput): VisualOverlay[] {
  let seq = 0;
  const nextId = (prefix: string): string => `${prefix}-${(seq += 1)}`;
  const overlays: VisualOverlay[] = [];

  for (const artifact of input.expected) {
    const relatedViolation = input.violations.find((v) => ruleRelatesToArtifact(v.ruleId, artifact.id));
    if (!relatedViolation) continue; // only draw "expected" ghosts for rules that actually failed
    const componentName = componentLabelFromArtifact(artifact.label);
    const overlay: VisualOverlay = {
      id: nextId('rule'),
      source: 'design-contract',
      label: componentName,
      box: artifact.box,
      severity: relatedViolation.severity,
      rationale: `Expected by ${relatedViolation.ruleId}: ${relatedViolation.expected}`,
    };
    overlays.push(overlay);
    relatedViolation.evidenceOverlayIds.push(overlay.id);
  }

  for (const box of input.capture.domBoxes) {
    overlays.push({
      id: nextId('dom'),
      source: 'dom-geometry',
      label: box.text ? `Detected ${box.label}: "${box.text}"` : `Detected ${box.label}`,
      box: box.box,
    });
  }

  // Pixel-diff sub-regions are deliberately NOT attached to a violation's
  // evidence. For an *absent* required element (e.g. the missing USA Banner)
  // a pixel delta is low signal — it just compares the expected reference to
  // whatever the page happens to render there. The clean evidence is the single
  // "Required by spec" contract box (above) plus the absence marker in the
  // viewer; the raw heatmap stays available behind the optional "Pixel delta"
  // toggle. We still emit these overlays so the power-user "all detected
  // elements" full-page view can show them, but they never clutter the hero.
  let mismatchSeq = 0;
  for (const region of input.diffRegions) {
    mismatchSeq += 1;
    const label =
      input.diffRegions.length > 1
        ? `Banner area — visual mismatch ${mismatchSeq}`
        : 'Banner area — visual mismatch';
    overlays.push({
      id: nextId('diff'),
      source: 'pixel-diff',
      label,
      box: region.box,
      confidence: region.changedRatio,
      severity: (region.changedRatio ?? 0) > 0.5 ? 'high' : 'medium',
      rationale: 'Pixels in this region differ from the rendered expected CMS banner reference.',
    });
  }

  return overlays;
}
