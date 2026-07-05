import type { VisualRuleViolation } from '../../report/types.js';
import { TOP_REGION_HEIGHT } from '../capture.js';
import { renderExpectedDsfrHeader } from '../expected-renderer.js';
import type { ExpectedVisualArtifact, VisualCapture } from '../types.js';
import type { RulePackContext, VisualRulePack } from './types.js';

/**
 * DSFR (Système de Design de l'État) — en-tête with Marianne + République Française.
 * https://www.systeme-de-design.gouv.fr/version-courante/fr/composants/en-tete/
 */

const REPUBLIQUE_PATTERN = /r[ée]publique\s*fran[çc]aise/i;
const MARIANNE_PATTERN = /marianne/i;
const DSFR_CLASS_PATTERN = /fr-header|fr-logo|fr-header__brand/i;
const HEADER_RULE_URL = 'https://www.systeme-de-design.gouv.fr/version-courante/fr/composants/en-tete/';

function isInTopRegion(capture: VisualCapture, box: { y: number; height: number }): boolean {
  const topHeight = Math.min(TOP_REGION_HEIGHT, capture.viewport.height);
  return box.y < topHeight;
}

function hasDsfrHeaderIdentity(capture: VisualCapture): boolean {
  const topText = capture.topRegionText;
  if (REPUBLIQUE_PATTERN.test(topText)) return true;
  if (MARIANNE_PATTERN.test(topText)) return true;
  if (capture.topRegionLogos.some((name) => REPUBLIQUE_PATTERN.test(name) || MARIANNE_PATTERN.test(name))) {
    return true;
  }
  return capture.domBoxes.some(
    (b) =>
      isInTopRegion(capture, b.box) &&
      (DSFR_CLASS_PATTERN.test(b.selector) || DSFR_CLASS_PATTERN.test(b.label)),
  );
}

export const dsfrFranceRulePack: VisualRulePack = {
  id: 'dsfr-france',
  title: "DSFR — Système de Design de l'État",
  version: '2026.1',

  appliesTo(url: URL): boolean {
    const host = url.hostname.toLowerCase();
    return host.endsWith('.gouv.fr') || host === 'gouv.fr';
  },

  async expectedArtifacts(capture: VisualCapture, ctx: RulePackContext): Promise<ExpectedVisualArtifact[]> {
    const { artifacts } = await renderExpectedDsfrHeader(ctx.browser, capture.viewport, ctx.outputDir);
    return artifacts;
  },

  async evaluate(capture: VisualCapture, expected: ExpectedVisualArtifact[]): Promise<VisualRuleViolation[]> {
    if (hasDsfrHeaderIdentity(capture)) return [];

    const expectedHeader = expected.find((a) => a.id === 'expected-dsfr-header');
    return [
      {
        ruleId: 'DSFR-HEADER-001',
        standard: 'DSFR',
        title: 'Missing DSFR en-tête (République Française identity)',
        expected:
          'The top of the page shows the DSFR header with the Marianne mark and "République Française" identity block, per the Système de Design de l\'État.',
        actual:
          'The top-of-page chrome region does not show République Française branding or DSFR header components (fr-header / fr-logo).',
        severity: 'high',
        evidenceOverlayIds: [],
        sourceUrl: expectedHeader?.sourceUrl ?? HEADER_RULE_URL,
      },
    ];
  },
};
