import type { VisualRuleViolation } from '../../report/types.js';
import { TOP_REGION_HEIGHT } from '../capture.js';
import { renderExpectedHeader } from '../expected-renderer.js';
import type { ExpectedVisualArtifact, VisualCapture } from '../types.js';
import type { RulePackContext, VisualRulePack } from './types.js';

/**
 * CMS / HealthCare.gov design rule pack (Visual Integrity plan:
 * Design Rule Oracle, Demo Showcase). Encodes two citable, publicly
 * documented rules as deterministic checks — no model call required:
 *
 * - CMS-HCGOV-BANNER-001: the USA Banner ("An official website of the
 *   United States government...") must appear at the top of the page.
 *   https://design.cms.gov/components/usa-banner/
 * - CMS-HCGOV-HEADER-002: the HealthCare.gov header chrome (wordmark/logo)
 *   must be present.
 *   https://design.cms.gov/components/header/healthcare-header/
 */

const BANNER_TEXT_PATTERN = /official website of the united states government/i;
const BANNER_ACTION_PATTERN = /here.?s how you know/i;
const HEADER_WORDMARK_PATTERN = /healthcare\.gov/i;
/** Logo accessible names may drop the dot (e.g. "HealthCareGov"), so allow it to be optional. */
const HEADER_LOGO_PATTERN = /healthcare\.?gov/i;

const BANNER_RULE_URL = 'https://design.cms.gov/components/usa-banner/';
const HEADER_RULE_URL = 'https://design.cms.gov/components/header/healthcare-header/';

function isInTopRegion(capture: VisualCapture, box: { y: number; height: number }): boolean {
  const topHeight = Math.min(TOP_REGION_HEIGHT, capture.viewport.height);
  return box.y < topHeight;
}

/**
 * True when the HealthCare.gov identity is present in the top chrome — either as
 * selectable wordmark text OR as an image/SVG logo's accessible name (alt /
 * aria-label / svg<title>). The logo often renders as an image, so a text-only
 * check produces a false "missing header" on pages that clearly show it.
 */
function hasHcgovHeaderIdentity(capture: VisualCapture): boolean {
  if (HEADER_WORDMARK_PATTERN.test(capture.topRegionText)) return true;
  return capture.topRegionLogos.some((name) => HEADER_LOGO_PATTERN.test(name));
}

/** True only when a USA Banner component (not a generic site header) is in the top chrome. */
function hasUsaBannerInTopChrome(capture: VisualCapture): boolean {
  const topText = capture.topRegionText;
  const bannerTextPresent = BANNER_TEXT_PATTERN.test(topText) || BANNER_ACTION_PATTERN.test(topText);
  if (bannerTextPresent) return true;
  return capture.domBoxes.some(
    (b) =>
      isInTopRegion(capture, b.box) &&
      (/usa-banner/i.test(b.selector) || /usa-banner/i.test(b.label)),
  );
}

export const cmsHealthcareRulePack: VisualRulePack = {
  id: 'cms-healthcare',
  title: 'CMS / HealthCare.gov Design System',
  version: '2026.1',

  appliesTo(url: URL): boolean {
    return url.hostname === 'healthcare.gov' || url.hostname.endsWith('.healthcare.gov');
  },

  async expectedArtifacts(capture: VisualCapture, ctx: RulePackContext): Promise<ExpectedVisualArtifact[]> {
    const { artifacts } = await renderExpectedHeader(ctx.browser, capture.viewport, ctx.outputDir);
    return artifacts;
  },

  async evaluate(capture: VisualCapture, expected: ExpectedVisualArtifact[]): Promise<VisualRuleViolation[]> {
    const violations: VisualRuleViolation[] = [];

    if (!hasUsaBannerInTopChrome(capture)) {
      const expectedBanner = expected.find((a) => a.id === 'expected-usa-banner');
      violations.push({
        ruleId: 'CMS-HCGOV-BANNER-001',
        standard: 'CMS-HCGOV',
        title: 'Missing required USA Banner (official government trust marker)',
        expected:
          'The top of the page shows the USA Banner: "An official website of the United States government" plus a "Here\'s how you know" disclosure, per the CMS Design System USA Banner component.',
        actual:
          'The top-of-page chrome region does not show the USA Banner text or a usa-banner component.',
        severity: 'high',
        evidenceOverlayIds: [],
        sourceUrl: expectedBanner?.sourceUrl ?? BANNER_RULE_URL,
      });
    }

    if (!hasHcgovHeaderIdentity(capture)) {
      const expectedHeader = expected.find((a) => a.id === 'expected-hcgov-header');
      violations.push({
        ruleId: 'CMS-HCGOV-HEADER-002',
        standard: 'CMS-HCGOV',
        title: 'Missing HealthCare.gov header wordmark/identity',
        expected:
          'The page header shows the HealthCare.gov wordmark/logo, matching the CMS Design System Healthcare.gov Header component.',
        actual:
          'No "HealthCare.gov" wordmark text or logo accessible name (alt/aria-label/svg title) was found in the top-of-page header region.',
        severity: 'medium',
        evidenceOverlayIds: [],
        sourceUrl: expectedHeader?.sourceUrl ?? HEADER_RULE_URL,
      });
    }

    return violations;
  },
};
