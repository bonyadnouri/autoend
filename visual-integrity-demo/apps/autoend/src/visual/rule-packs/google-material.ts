import type { VisualRuleViolation } from '../../report/types.js';
import { TOP_REGION_HEIGHT } from '../capture.js';
import { renderExpectedGoogleChrome } from '../expected-renderer.js';
import type { ExpectedVisualArtifact, VisualCapture } from '../types.js';
import type { RulePackContext, VisualRulePack } from './types.js';

/**
 * Google / Material product chrome — first-party google.com surfaces should
 * expose recognizable Google branding and an account affordance in top chrome.
 * Legacy or acquired products often break this pattern.
 *
 * This is a heuristic check, not a full Material 3 audit.
 */

const GOOGLE_WORDMARK = /\bgoogle\b/i;
const ACCOUNT_AFFORDANCE =
  /google account|sign in|sign-in|connexion|compte google|aria-label.*account/i;
const APPS_LAUNCHER = /google apps|applications google|aria-label.*apps/i;
const MATERIAL_HINT = /material-icons|material-symbols|mdc-|mat-|gb_|gbar/i;

const CHROME_RULE_URL = 'https://m3.material.io/foundations/design-tokens/overview';

/** Subdomains we skip — not consumer product chrome (API docs, static assets). */
const SKIP_HOSTS = new Set(['developers.google.com', 'cloud.google.com', 'support.google.com']);

function isInTopRegion(capture: VisualCapture, box: { y: number; height: number }): boolean {
  const topHeight = Math.min(TOP_REGION_HEIGHT, capture.viewport.height);
  return box.y < topHeight;
}

function hasGoogleProductChrome(capture: VisualCapture): boolean {
  const topText = capture.topRegionText;
  const combined = `${topText} ${capture.topRegionLogos.join(' ')} ${capture.domBoxes
    .filter((b) => isInTopRegion(capture, b.box))
    .map((b) => `${b.label} ${b.text ?? ''}`)
    .join(' ')}`;

  const hasWordmark =
    GOOGLE_WORDMARK.test(topText) ||
    capture.topRegionLogos.some((n) => GOOGLE_WORDMARK.test(n));
  const hasAccount =
    ACCOUNT_AFFORDANCE.test(combined) || APPS_LAUNCHER.test(combined) || MATERIAL_HINT.test(combined);

  // Product pages need both identity and navigation/account chrome.
  return hasWordmark && hasAccount;
}

export const googleMaterialRulePack: VisualRulePack = {
  id: 'google-material',
  title: 'Google / Material Product Chrome',
  version: '2026.1',

  appliesTo(url: URL): boolean {
    const host = url.hostname.toLowerCase();
    if (SKIP_HOSTS.has(host)) return false;
    return host.endsWith('.google.com') || host === 'google.com';
  },

  async expectedArtifacts(capture: VisualCapture, ctx: RulePackContext): Promise<ExpectedVisualArtifact[]> {
    const { artifacts } = await renderExpectedGoogleChrome(ctx.browser, capture.viewport, ctx.outputDir);
    return artifacts;
  },

  async evaluate(capture: VisualCapture, expected: ExpectedVisualArtifact[]): Promise<VisualRuleViolation[]> {
    if (hasGoogleProductChrome(capture)) return [];

    const expectedChrome = expected.find((a) => a.id === 'expected-google-chrome');
    return [
      {
        ruleId: 'GOOGLE-MAT-CHROME-001',
        standard: 'Material',
        title: 'Missing standard Google product chrome (wordmark + account affordance)',
        expected:
          'Google consumer product pages show the Google wordmark/logo in the top chrome plus a Google Account or apps-launcher affordance, consistent with Material product patterns.',
        actual:
          'The top-of-page region lacks recognizable Google product chrome (wordmark with account/apps navigation). This often indicates a legacy or off-system UI.',
        severity: 'medium',
        evidenceOverlayIds: [],
        sourceUrl: expectedChrome?.sourceUrl ?? CHROME_RULE_URL,
      },
    ];
  },
};
