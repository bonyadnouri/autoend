import type { Browser } from 'playwright';
import type { ExpectedVisualArtifact, ViewportSize } from './types.js';

/**
 * The "expected" side of the CMS/HealthCare.gov comparison is not a prior
 * screenshot — it is a rendering of the design rule itself (Visual Integrity
 * plan: Expected Design Rendering). This stays a small, self-contained
 * HTML/CSS approximation of the USWDS USA Banner + HealthCare.gov header
 * chrome: close enough for a visual contract, without pulling the full USWDS
 * CSS bundle or a live Figma/Storybook dependency into the MVP.
 */

export const USA_BANNER_HEIGHT = 40;
export const HCGOV_HEADER_HEIGHT = 96;

function expectedHeaderHtml(viewport: ViewportSize): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  html, body { margin: 0; padding: 0; width: ${viewport.width}px; font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; }
  .usa-banner {
    display: flex; align-items: center; gap: 8px;
    height: ${USA_BANNER_HEIGHT}px; padding: 0 16px;
    background: #f0f0f0; border-bottom: 1px solid #dfe1e2;
    font-size: 12px; color: #1b1b1b;
  }
  .usa-banner__flag { font-size: 16px; line-height: 1; }
  .usa-banner__text { font-weight: 400; }
  .usa-banner__action {
    margin-left: auto; font-weight: 600; text-decoration: underline;
    display: flex; align-items: center; gap: 4px; color: #005ea2;
  }
  .hcgov-header {
    display: flex; align-items: center; gap: 24px;
    height: ${HCGOV_HEADER_HEIGHT}px; padding: 0 24px;
    background: #ffffff; border-bottom: 4px solid #0071bc;
  }
  .hcgov-header__logo {
    font-size: 22px; font-weight: 700; color: #0071bc; letter-spacing: -0.02em;
  }
  .hcgov-header__logo span { color: #212121; }
  .hcgov-header__nav { display: flex; gap: 20px; margin-left: auto; font-size: 14px; color: #212121; }
</style>
</head>
<body>
  <div class="usa-banner" data-testid="expected-usa-banner">
    <span class="usa-banner__flag" aria-hidden="true">🇺🇸</span>
    <span class="usa-banner__text">An official website of the United States government</span>
    <span class="usa-banner__action">Here's how you know <span aria-hidden="true">⌄</span></span>
  </div>
  <div class="hcgov-header" data-testid="expected-hcgov-header">
    <div class="hcgov-header__logo">Health<span>Care</span>.gov</div>
    <nav class="hcgov-header__nav">
      <span>Get Coverage</span>
      <span>Keep or Update Your Plan</span>
      <span>See Topics</span>
    </nav>
  </div>
</body>
</html>`;
}

/**
 * Render the CMS/HealthCare.gov expected header+banner chrome at the same
 * viewport as the target capture, and crop it into named artifacts the
 * viewer can show as the "expected" side of the comparison and as a ghost
 * overlay source.
 */
function usaBannerOnlyHtml(viewport: ViewportSize): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  html, body { margin: 0; padding: 0; width: ${viewport.width}px; font-family: "Public Sans", -apple-system, "Helvetica Neue", Arial, sans-serif; }
  .usa-banner {
    display: flex; align-items: center; gap: 8px;
    height: ${USA_BANNER_HEIGHT}px; padding: 0 16px;
    background: #f0f0f0; border-bottom: 1px solid #dfe1e2;
    font-size: 12px; color: #1b1b1b;
  }
  .usa-banner__flag { font-size: 16px; line-height: 1; }
  .usa-banner__text { font-weight: 400; }
  .usa-banner__action {
    margin-left: auto; font-weight: 600; text-decoration: underline;
    display: flex; align-items: center; gap: 4px; color: #005ea2;
  }
</style>
</head>
<body>
  <div class="usa-banner" data-testid="expected-usa-banner">
    <span class="usa-banner__flag" aria-hidden="true">🇺🇸</span>
    <span class="usa-banner__text">An official website of the United States government</span>
    <span class="usa-banner__action">Here's how you know <span aria-hidden="true">⌄</span></span>
  </div>
</body>
</html>`;
}

/** USWDS / Federal Website Standards — USA Banner only (no agency header). */
export async function renderExpectedUsaBanner(
  browser: Browser,
  viewport: ViewportSize,
  outputDir: string,
): Promise<{ file: string; artifacts: ExpectedVisualArtifact[] }> {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  try {
    await page.setContent(usaBannerOnlyHtml(viewport), { waitUntil: 'load' });
    const file = 'expected-usa-banner.png';
    await page.screenshot({
      path: `${outputDir}/${file}`,
      clip: { x: 0, y: 0, width: viewport.width, height: USA_BANNER_HEIGHT },
    });
    return {
      file,
      artifacts: [
        {
          id: 'expected-usa-banner',
          label: 'Expected USA Banner region',
          file,
          box: { x: 0, y: 0, width: viewport.width, height: USA_BANNER_HEIGHT },
          sourceUrl: 'https://standards.digital.gov/standards/banner/',
        },
      ],
    };
  } finally {
    await context.close();
  }
}

const DSFR_HEADER_HEIGHT = 96;

function dsfrHeaderHtml(viewport: ViewportSize): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<style>
  html, body { margin: 0; padding: 0; width: ${viewport.width}px; font-family: Marianne, -apple-system, Arial, sans-serif; }
  .fr-header {
    display: flex; align-items: center; gap: 16px;
    height: ${DSFR_HEADER_HEIGHT}px; padding: 0 24px;
    background: #fff; border-bottom: 1px solid #ddd;
  }
  .fr-logo {
    font-size: 13px; font-weight: 700; line-height: 1.15; color: #000091;
    text-transform: none; letter-spacing: 0;
  }
  .marianne { width: 40px; height: 40px; background: linear-gradient(135deg, #000091 50%, #e1000f 50%); border-radius: 2px; flex-shrink: 0; }
  .service { margin-left: auto; font-size: 14px; color: #161616; font-weight: 600; }
</style>
</head>
<body>
  <header role="banner" class="fr-header" data-testid="expected-dsfr-header">
    <div class="marianne" aria-hidden="true"></div>
    <p class="fr-logo">République<br>Française</p>
    <span class="service">Service public</span>
  </header>
</body>
</html>`;
}

/** DSFR en-tête — Marianne + République Française identity block. */
export async function renderExpectedDsfrHeader(
  browser: Browser,
  viewport: ViewportSize,
  outputDir: string,
): Promise<{ file: string; artifacts: ExpectedVisualArtifact[] }> {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  try {
    await page.setContent(dsfrHeaderHtml(viewport), { waitUntil: 'load' });
    const file = 'expected-dsfr-header.png';
    await page.screenshot({
      path: `${outputDir}/${file}`,
      clip: { x: 0, y: 0, width: viewport.width, height: DSFR_HEADER_HEIGHT },
    });
    return {
      file,
      artifacts: [
        {
          id: 'expected-dsfr-header',
          label: 'Expected DSFR header (République Française)',
          file,
          box: { x: 0, y: 0, width: viewport.width, height: DSFR_HEADER_HEIGHT },
          sourceUrl: 'https://www.systeme-de-design.gouv.fr/version-courante/fr/composants/en-tete/',
        },
      ],
    };
  } finally {
    await context.close();
  }
}

const GOOGLE_CHROME_HEIGHT = 64;

function googleChromeHtml(viewport: ViewportSize): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  html, body { margin: 0; padding: 0; width: ${viewport.width}px; font-family: "Google Sans", Roboto, Arial, sans-serif; }
  .gbar {
    display: flex; align-items: center; gap: 24px;
    height: ${GOOGLE_CHROME_HEIGHT}px; padding: 0 24px;
    background: #fff; border-bottom: 1px solid #e8eaed;
  }
  .glogo { font-size: 22px; font-weight: 500; letter-spacing: -0.5px; }
  .glogo b { color: #4285f4; font-weight: 500; }
  .glogo r { color: #ea4335; }
  .glogo y { color: #fbbc04; }
  .glogo g { color: #34a853; }
  .nav { display: flex; gap: 20px; margin-left: 32px; font-size: 14px; color: #5f6368; }
  .account { margin-left: auto; width: 32px; height: 32px; border-radius: 50%; background: #1a73e8; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 500; }
</style>
</head>
<body>
  <header role="banner" class="gbar" data-testid="expected-google-chrome">
    <div class="glogo"><b>G</b><r>o</r><y>o</y><y>g</y><b>l</b><g>e</g></div>
    <nav class="nav"><span>Search</span><span>Images</span><span>Maps</span></nav>
    <div class="account" aria-label="Google Account">M</div>
  </header>
</body>
</html>`;
}

/** Material / Google product chrome — colored wordmark + account affordance. */
export async function renderExpectedGoogleChrome(
  browser: Browser,
  viewport: ViewportSize,
  outputDir: string,
): Promise<{ file: string; artifacts: ExpectedVisualArtifact[] }> {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  try {
    await page.setContent(googleChromeHtml(viewport), { waitUntil: 'load' });
    const file = 'expected-google-chrome.png';
    await page.screenshot({
      path: `${outputDir}/${file}`,
      clip: { x: 0, y: 0, width: viewport.width, height: GOOGLE_CHROME_HEIGHT },
    });
    return {
      file,
      artifacts: [
        {
          id: 'expected-google-chrome',
          label: 'Expected Google product chrome',
          file,
          box: { x: 0, y: 0, width: viewport.width, height: GOOGLE_CHROME_HEIGHT },
          sourceUrl: 'https://m3.material.io/foundations/design-tokens/overview',
        },
      ],
    };
  } finally {
    await context.close();
  }
}

export async function renderExpectedHeader(
  browser: Browser,
  viewport: ViewportSize,
  outputDir: string,
): Promise<{ file: string; artifacts: ExpectedVisualArtifact[] }> {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  try {
    await page.setContent(expectedHeaderHtml(viewport), { waitUntil: 'load' });
    const file = 'expected-header.png';
    const totalHeight = USA_BANNER_HEIGHT + HCGOV_HEADER_HEIGHT;
    await page.screenshot({
      path: `${outputDir}/${file}`,
      clip: { x: 0, y: 0, width: viewport.width, height: totalHeight },
    });
    const artifacts: ExpectedVisualArtifact[] = [
      {
        id: 'expected-usa-banner',
        label: 'Expected USA Banner region',
        file,
        box: { x: 0, y: 0, width: viewport.width, height: USA_BANNER_HEIGHT },
        sourceUrl: 'https://design.cms.gov/components/usa-banner/',
      },
      {
        id: 'expected-hcgov-header',
        label: 'Expected HealthCare.gov Header region',
        file,
        box: { x: 0, y: USA_BANNER_HEIGHT, width: viewport.width, height: HCGOV_HEADER_HEIGHT },
        sourceUrl: 'https://design.cms.gov/components/header/healthcare-header/',
      },
    ];
    return { file, artifacts };
  } finally {
    await context.close();
  }
}
