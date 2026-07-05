import { readFile } from 'node:fs/promises';

/**
 * Optional design-token/component-spec input (Visual Integrity plan:
 * Implementation Phases > "Design spec import", MVP Scope: "support JSON
 * design-token input before full Figma API integration"). This is
 * intentionally the normalized shape a Figma Variables/Tokens/Components
 * export would map into — a future `figma-import.ts` can populate the same
 * `DesignTokenSet` without touching rule packs or the viewer.
 */
export interface ColorToken {
  name: string;
  value: string; // hex or rgb()
}

export interface SpacingToken {
  name: string;
  px: number;
}

export interface TypographyToken {
  name: string;
  fontFamily: string;
  fontSizePx: number;
  fontWeight: number;
  lineHeightPx?: number;
}

export interface ComponentSpec {
  name: string;
  /** CSS selector(s) this component is expected to match on a live page, for cross-checking. */
  selectors: string[];
  expectedColors?: string[];
  expectedTypography?: string[];
  minHeightPx?: number;
  minWidthPx?: number;
}

export interface DesignTokenSet {
  id: string;
  version: string;
  source: 'json' | 'figma-export';
  colors: ColorToken[];
  spacing: SpacingToken[];
  typography: TypographyToken[];
  components: ComponentSpec[];
}

const EMPTY_TOKEN_SET: DesignTokenSet = {
  id: 'empty',
  version: '0',
  source: 'json',
  colors: [],
  spacing: [],
  typography: [],
  components: [],
};

/**
 * Loads a JSON design-token file matching `DesignTokenSet`. Not yet wired
 * into rule evaluation — rule packs currently encode their checks directly
 * (see rule-packs/cms-healthcare.ts) — but this gives rule packs a documented
 * extension point once token-driven checks (color/typography/spacing
 * assertions) are needed, without requiring a live Figma API integration.
 */
export async function loadDesignTokens(path: string): Promise<DesignTokenSet> {
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as Partial<DesignTokenSet>;
    return {
      id: parsed.id ?? path,
      version: parsed.version ?? '0',
      source: parsed.source ?? 'json',
      colors: parsed.colors ?? [],
      spacing: parsed.spacing ?? [],
      typography: parsed.typography ?? [],
      components: parsed.components ?? [],
    };
  } catch {
    return EMPTY_TOKEN_SET;
  }
}
