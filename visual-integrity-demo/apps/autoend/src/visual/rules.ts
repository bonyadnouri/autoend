import { cmsHealthcareRulePack } from './rule-packs/cms-healthcare.js';
import { dsfrFranceRulePack } from './rule-packs/dsfr-france.js';
import { googleMaterialRulePack } from './rule-packs/google-material.js';
import { uswdsFederalRulePack } from './rule-packs/uswds-federal.js';
import type { VisualRulePack } from './rule-packs/types.js';

/**
 * Rule pack registry (Visual Integrity plan: Extensibility). Adding a new
 * standard (dhs-uswds, govuk, gc-canada, custom-json) means writing a new
 * `rule-packs/*.ts` and registering it here — replay/run/CLI code never
 * changes. More specific packs must precede broader ones in `findApplicableRulePack`.
 */
const REGISTRY: VisualRulePack[] = [
  cmsHealthcareRulePack,
  dsfrFranceRulePack,
  googleMaterialRulePack,
  uswdsFederalRulePack,
];

export function getRulePack(id: string): VisualRulePack | undefined {
  return REGISTRY.find((pack) => pack.id === id);
}

/** First registered pack whose `appliesTo(url)` matches, or undefined (Failure Behavior: "do nothing"). */
export function findApplicableRulePack(url: URL): VisualRulePack | undefined {
  return REGISTRY.find((pack) => pack.appliesTo(url));
}

/**
 * Resolve which rule pack to use: explicit CLI/env id wins; otherwise auto-detect
 * from the target URL. Returns undefined when nothing applies.
 */
export function resolveRulePack(target: URL, explicitId?: string): VisualRulePack | undefined {
  const id = explicitId?.trim() || process.env.VISUAL_RULE_PACK?.trim();
  if (id) return getRulePack(id);
  return findApplicableRulePack(target);
}

export function listRulePacks(): VisualRulePack[] {
  return [...REGISTRY];
}
