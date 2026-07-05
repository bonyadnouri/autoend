import type { VisualClassifierResult, VisualOverlay, VisualRuleViolation } from '../report/types.js';

/**
 * Visual Integrity's internal working types (Visual Integrity plan: Module
 * Boundaries). `report/types.ts` owns the Finding-facing schema; everything
 * here is intermediate state produced/consumed while building that schema.
 */

export interface ViewportSize {
  width: number;
  height: number;
}

/** One DOM-derived bounding box for a known element (Tier 0: DOM geometry). */
export interface DomBox {
  selector: string;
  label: string;
  box: { x: number; y: number; width: number; height: number };
  text?: string;
}

/**
 * Everything Tier 0 (Playwright + DOM) captures from a live page — the
 * deterministic evidence every later tier builds on.
 */
export interface VisualCapture {
  url: string;
  viewport: ViewportSize;
  /** Filename within the run's evidence/output dir. */
  screenshotFile: string;
  /** Cropped top-of-page region, filename within the same dir. */
  topRegionFile: string;
  /** Absolute path to the directory screenshotFile/topRegionFile live in. */
  outputDir: string;
  /** Visible body text, whitespace-collapsed, capped for cheap substring/regex checks. */
  visibleText: string;
  /** Text from elements whose layout box intersects the top-of-page chrome region. */
  topRegionText: string;
  /**
   * Accessible names / alt / aria-label / svg<title> of image-like or logo-like
   * elements in the top-of-page chrome — lets header checks recognize a logo
   * that renders as an image/SVG rather than selectable text.
   */
  topRegionLogos: string[];
  domBoxes: DomBox[];
  /** Landmark/heading roles seen, e.g. "banner", "navigation", "h1: Welcome to Plan Finder". */
  accessibilitySummary: string[];
  capturedAt: string;
}

/** The rendered "expected" side of a comparison — a rule pack's reference artifact. */
export interface ExpectedVisualArtifact {
  id: string;
  label: string;
  /** Filename within outputDir. */
  file: string;
  box: { x: number; y: number; width: number; height: number };
  sourceUrl?: string;
}

export interface RegionDetectionInput {
  imageFile: string;
  label?: string;
}

export interface LayoutParseInput {
  imageFile: string;
}

export interface ViolationReviewInput {
  actualImageFile: string;
  expectedImageFile?: string;
  fullPageThumbnailFile?: string;
  domText: string;
  violations: VisualRuleViolation[];
  deterministicOverlays: VisualOverlay[];
}

/**
 * Pluggable model backend (Visual Integrity plan: Provider Interface). Every
 * method is optional and bounded — the deterministic pipeline works with no
 * provider at all (VISUAL_MODEL_PROVIDER=none).
 */
export interface VisualModelProvider {
  readonly id: string;
  detectRegions?(input: RegionDetectionInput): Promise<VisualOverlay[]>;
  parseLayout?(input: LayoutParseInput): Promise<VisualOverlay[]>;
  reviewViolation?(input: ViolationReviewInput): Promise<VisualClassifierResult>;
}

export type VisualModelEffort = 'off' | 'fast' | 'deep';

export interface VisualIntegrityConfig {
  mode: 'off' | 'rules' | 'models';
  rulePackId: string;
  providerId: 'none' | 'nvidia';
  effort: VisualModelEffort;
}
