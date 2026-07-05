/** Maps rule IDs to the expected artifact band that substantiates them. */
export const RULE_EXPECTED_ARTIFACT_ID: Record<string, string> = {
  'CMS-HCGOV-BANNER-001': 'expected-usa-banner',
  'CMS-HCGOV-HEADER-002': 'expected-hcgov-header',
  'USWDS-BANNER-001': 'expected-usa-banner',
  'DSFR-HEADER-001': 'expected-dsfr-header',
  'GOOGLE-MAT-CHROME-001': 'expected-google-chrome',
};

export function ruleRelatesToArtifact(ruleId: string, artifactId: string): boolean {
  return RULE_EXPECTED_ARTIFACT_ID[ruleId] === artifactId;
}

export function componentLabelFromArtifact(label: string): string {
  return label.replace(/^Expected\s+/i, '').replace(/\s+region$/i, '');
}
