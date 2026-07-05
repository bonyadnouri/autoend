import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Finding } from '../report/types.js';
import { diffFullPngs, type PixelDiffResult } from './diff.js';

export const BASELINE_CHANGED_THRESHOLD = 0.02;

export interface BaselineCompareResult {
  finding?: Finding;
  diff?: PixelDiffResult;
}

/**
 * Compare an actual Flow screenshot against a stored baseline.
 * Copies evidence files into outputDir for the Run artifact.
 */
export async function compareToBaseline(
  baselinePath: string,
  actualPath: string,
  outputDir: string,
  opts: {
    flowId: string;
    flowTitle: string;
    evidencePrefix: string;
    threshold?: number;
  },
): Promise<BaselineCompareResult> {
  await mkdir(outputDir, { recursive: true });
  const actualFile = 'actual.png';
  const baselineFile = 'baseline.png';
  await copyFile(actualPath, join(outputDir, actualFile));
  await copyFile(baselinePath, join(outputDir, baselineFile));

  const diff = diffFullPngs(join(outputDir, actualFile), join(outputDir, baselineFile), outputDir, 'diff.png');
  const threshold = opts.threshold ?? BASELINE_CHANGED_THRESHOLD;
  if (diff.changedRatio <= threshold) return { diff };

  const prefix = opts.evidencePrefix;
  const pct = (diff.changedRatio * 100).toFixed(1);
  const finding: Finding = {
    id: `baseline-${opts.flowId}`,
    kind: 'regression',
    flowId: opts.flowId,
    title: `Visual baseline changed for "${opts.flowTitle}"`,
    detail: `${pct}% of the viewport pixels differ from the stored baseline (threshold ${(threshold * 100).toFixed(0)}%).`,
    visual: {
      baselineFile: `${prefix}${baselineFile}`,
      actualFile: `${prefix}${actualFile}`,
      diffFile: `${prefix}${diff.diffFile}`,
      viewport: `${diff.width}x${diff.height}`,
      threshold,
      changedPixels: diff.changedPixels,
      changedRatio: diff.changedRatio,
      regions: diff.regions,
      designSource: { kind: 'baseline-screenshot', id: opts.flowId },
    },
  };
  return { finding, diff };
}
