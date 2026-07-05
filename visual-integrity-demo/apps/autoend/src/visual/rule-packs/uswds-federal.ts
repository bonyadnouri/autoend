import type { VisualRuleViolation } from '../../report/types.js';
import { TOP_REGION_HEIGHT } from '../capture.js';
import { renderExpectedUsaBanner } from '../expected-renderer.js';
import type { ExpectedVisualArtifact, VisualCapture } from '../types.js';
import type { RulePackContext, VisualRulePack } from './types.js';

/**
 * USWDS / Federal Website Standards — USA Banner on every .gov/.mil page.
 * https://standards.digital.gov/standards/banner/
 * https://designsystem.digital.gov/components/banner/
 */

const BANNER_TEXT_PATTERN = /official website of the united states government/i;
const BANNER_ACTION_PATTERN = /here.?s how you know/i;
const BANNER_RULE_URL = 'https://standards.digital.gov/standards/banner/';

function isInTopRegion(capture: VisualCapture, box: { y: number; height: number }): boolean {
  const topHeight = Math.min(TOP_REGION_HEIGHT, capture.viewport.height);
  return box.y < topHeight;
}

function hasUsaBannerInTopChrome(capture: VisualCapture): boolean {
  const topText = capture.topRegionText;
  if (BANNER_TEXT_PATTERN.test(topText) || BANNER_ACTION_PATTERN.test(topText)) return true;
  return capture.domBoxes.some(
    (b) =>
      isInTopRegion(capture, b.box) &&
      (/usa-banner/i.test(b.selector) || /usa-banner/i.test(b.label)),
  );
}

export const uswdsFederalRulePack: VisualRulePack = {
  id: 'uswds-federal',
  title: 'USWDS / Federal Website Standards',
  version: '2026.1',

  appliesTo(url: URL): boolean {
    const host = url.hostname.toLowerCase();
    return host.endsWith('.gov') || host.endsWith('.mil') || host === 'gov';
  },

  async expectedArtifacts(_capture: VisualCapture, ctx: RulePackContext): Promise<ExpectedVisualArtifact[]> {
    const { artifacts } = await renderExpectedUsaBanner(ctx.browser, _capture.viewport, ctx.outputDir);
    return artifacts;
  },

  async evaluate(capture: VisualCapture, expected: ExpectedVisualArtifact[]): Promise<VisualRuleViolation[]> {
    if (hasUsaBannerInTopChrome(capture)) return [];

    const expectedBanner = expected.find((a) => a.id === 'expected-usa-banner');
    return [
      {
        ruleId: 'USWDS-BANNER-001',
        standard: 'USWDS',
        title: 'Missing required USA Banner (official government trust marker)',
        expected:
          'The top of the page shows the USA Banner: "An official website of the United States government" plus a "Here\'s how you know" disclosure, per Federal Website Standards and USWDS.',
        actual:
          'The top-of-page chrome region does not show the USA Banner text or a usa-banner component.',
        severity: 'high',
        evidenceOverlayIds: [],
        sourceUrl: expectedBanner?.sourceUrl ?? BANNER_RULE_URL,
      },
    ];
  },
};
