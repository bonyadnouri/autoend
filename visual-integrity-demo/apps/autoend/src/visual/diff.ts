import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
// pixelmatch and pngjs ship no ESM types; both are tiny, dependency-free
// pure-JS libraries (Visual Integrity plan: Anti-Bloat Rules > "do not add
// large frontend visualization dependencies").
// eslint-disable-next-line @typescript-eslint/no-var-requires
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import type { VisualRegion } from '../report/types.js';
import { type PerfTiming, timeStage } from './perf.js';

const BLOCK_SIZE = 16;
const BLOCK_CHANGED_RATIO = 0.15;
const MIN_REGION_BLOCKS = 2;
const MAX_REGIONS = 8;

function readPng(path: string): PNG {
  return PNG.sync.read(readFileSync(path));
}

/**
 * Copy a horizontal band `[y, y+height)` of `src` into a fresh `width×height`
 * PNG. RGBA rows are row-major, so each source row is a contiguous slice.
 */
function cropBand(src: PNG, y: number, height: number, width: number): PNG {
  const out = new PNG({ width, height });
  const copyW = Math.min(width, src.width);
  for (let row = 0; row < height; row++) {
    const srcY = y + row;
    if (srcY < 0 || srcY >= src.height) continue;
    const srcStart = srcY * src.width * 4;
    const dstStart = row * width * 4;
    src.data.copy(out.data, dstStart, srcStart, srcStart + copyW * 4);
  }
  return out;
}

/** One component band to scope the diff to, in top-region-crop coordinates. */
export interface SpecDiffBand {
  label: string;
  /** Top offset (px) of the band within both the expected image and the actual crop. */
  y: number;
  /** Band height in px. */
  height: number;
}

export interface PixelDiffResult {
  /** Filename within outputDir — a heatmap-style visualization of the diff. */
  diffFile: string;
  changedPixels: number;
  changedRatio: number;
  regions: VisualRegion[];
  width: number;
  height: number;
}

/**
 * Tier 0 pixel diff (Visual Integrity plan: Model Stack > Tier 0, "Pixel
 * operations" + "Connected components"). Compares the actual top-region
 * crop against the rendered expected-header crop and turns mismatched
 * pixels into both a heatmap image and coarse bounding-box regions — no
 * model call required.
 *
 * Band scoping: diffing the whole 220px capture against the full expected
 * header just measures "two different layouts" (~52% changed) and says nothing
 * about a specific rule. Instead we diff ONLY the band(s) of the component(s)
 * that actually violated — e.g. a banner violation compares just the expected
 * banner band `y[0,40)` against the same rows of the actual capture — so
 * changedPixels/changedRatio are scoped to that component, not the whole region.
 */
export async function computeSpecDiff(
  actualImagePath: string,
  expectedImagePath: string,
  bands: SpecDiffBand[],
  outputDir: string,
  timings: PerfTiming[] = [],
): Promise<PixelDiffResult> {
  return timeStage('pixelDiff', timings, async () => {
    const actual = readPng(actualImagePath);
    const expected = readPng(expectedImagePath);
    const width = Math.min(actual.width, expected.width);
    const maxHeight = Math.min(actual.height, expected.height);

    // With no explicit bands, fall back to the full overlapping region so the
    // function stays usable, but callers should scope to violated components.
    const requested = bands.length > 0 ? bands : [{ label: 'top region', y: 0, height: maxHeight }];
    const clamped = requested
      .map((b) => {
        const y = Math.max(0, Math.floor(b.y));
        const height = Math.min(Math.floor(b.height), maxHeight - y);
        return { label: b.label, y, height };
      })
      .filter((b) => b.height > 0);

    // Heatmap/mask keep top-region-crop coordinates so overlay regions line up;
    // only the covered bands are populated, everything else stays transparent.
    const coveredHeight = clamped.reduce((max, b) => Math.max(max, b.y + b.height), 0) || 1;
    const heatmap = new PNG({ width, height: coveredHeight });
    const maskOnly = new PNG({ width, height: coveredHeight });

    let changedPixels = 0;
    let scopedArea = 0;
    for (const band of clamped) {
      const actualBand = cropBand(actual, band.y, band.height, width);
      const expectedBand = cropBand(expected, band.y, band.height, width);

      const bandHeatmap = new PNG({ width, height: band.height });
      changedPixels += pixelmatch(actualBand.data, expectedBand.data, bandHeatmap.data, width, band.height, {
        threshold: 0.15,
        includeAA: false,
        diffColor: [255, 60, 60],
        alpha: 0.35,
      });

      const bandMask = new PNG({ width, height: band.height });
      pixelmatch(actualBand.data, expectedBand.data, bandMask.data, width, band.height, {
        threshold: 0.15,
        includeAA: false,
        diffMask: true,
      });

      // Composite each band back at its true y offset within the top-region crop.
      const offset = band.y * width * 4;
      bandHeatmap.data.copy(heatmap.data, offset, 0, band.height * width * 4);
      bandMask.data.copy(maskOnly.data, offset, 0, band.height * width * 4);
      scopedArea += width * band.height;
    }

    const diffFile = 'heatmap.png';
    writeFileSync(join(outputDir, diffFile), PNG.sync.write(heatmap));

    const regions = extractRegionsFromMask(maskOnly, width, coveredHeight);

    return {
      diffFile,
      changedPixels,
      changedRatio: scopedArea > 0 ? changedPixels / scopedArea : 0,
      regions,
      width,
      height: coveredHeight,
    };
  });
}

/** Downsample the pixel mask to a block grid, then flood-fill to group changed blocks into boxes. */
export function extractRegionsFromMask(mask: PNG, width: number, height: number): VisualRegion[] {
  const gridW = Math.ceil(width / BLOCK_SIZE);
  const gridH = Math.ceil(height / BLOCK_SIZE);
  const changed = new Uint8Array(gridW * gridH);

  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const x0 = gx * BLOCK_SIZE;
      const y0 = gy * BLOCK_SIZE;
      const x1 = Math.min(x0 + BLOCK_SIZE, width);
      const y1 = Math.min(y0 + BLOCK_SIZE, height);
      let changedInBlock = 0;
      const total = (x1 - x0) * (y1 - y0);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const idx = (y * width + x) * 4 + 3; // alpha channel
          if (mask.data[idx] > 0) changedInBlock++;
        }
      }
      if (total > 0 && changedInBlock / total >= BLOCK_CHANGED_RATIO) changed[gy * gridW + gx] = 1;
    }
  }

  const visited = new Uint8Array(gridW * gridH);
  const regions: VisualRegion[] = [];

  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const start = gy * gridW + gx;
      if (!changed[start] || visited[start]) continue;

      const stack = [[gx, gy]];
      visited[start] = 1;
      let minGx = gx, maxGx = gx, minGy = gy, maxGy = gy, blockCount = 0;

      while (stack.length > 0) {
        const [cx, cy] = stack.pop()!;
        blockCount++;
        minGx = Math.min(minGx, cx);
        maxGx = Math.max(maxGx, cx);
        minGy = Math.min(minGy, cy);
        maxGy = Math.max(maxGy, cy);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= gridW || ny >= gridH) continue;
          const nIdx = ny * gridW + nx;
          if (changed[nIdx] && !visited[nIdx]) {
            visited[nIdx] = 1;
            stack.push([nx, ny]);
          }
        }
      }

      if (blockCount < MIN_REGION_BLOCKS) continue;
      const box = {
        x: minGx * BLOCK_SIZE,
        y: minGy * BLOCK_SIZE,
        width: Math.min((maxGx - minGx + 1) * BLOCK_SIZE, width - minGx * BLOCK_SIZE),
        height: Math.min((maxGy - minGy + 1) * BLOCK_SIZE, height - minGy * BLOCK_SIZE),
      };
      regions.push({
        label: `Changed region ${regions.length + 1}`,
        box,
        changedRatio: blockCount / (gridW * gridH),
      });
    }
  }

  return regions.sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height).slice(0, MAX_REGIONS);
}

/**
 * Full-viewport pixel diff — shared core for per-Flow baseline comparison.
 * Unlike computeSpecDiff, diffs the entire overlapping region (no band scoping).
 */
export function diffFullPngs(
  actualImagePath: string,
  expectedImagePath: string,
  outputDir: string,
  diffFileName = 'diff.png',
): PixelDiffResult {
  const actual = readPng(actualImagePath);
  const expected = readPng(expectedImagePath);
  const width = Math.min(actual.width, expected.width);
  const height = Math.min(actual.height, expected.height);

  const actualCrop = cropBand(actual, 0, height, width);
  const expectedCrop = cropBand(expected, 0, height, width);
  const heatmap = new PNG({ width, height });
  const maskOnly = new PNG({ width, height });

  const changedPixels = pixelmatch(actualCrop.data, expectedCrop.data, heatmap.data, width, height, {
    threshold: 0.15,
    includeAA: false,
    diffColor: [255, 60, 60],
    alpha: 0.35,
  });
  pixelmatch(actualCrop.data, expectedCrop.data, maskOnly.data, width, height, {
    threshold: 0.15,
    includeAA: false,
    diffMask: true,
  });

  writeFileSync(join(outputDir, diffFileName), PNG.sync.write(heatmap));

  const scopedArea = width * height;
  return {
    diffFile: diffFileName,
    changedPixels,
    changedRatio: scopedArea > 0 ? changedPixels / scopedArea : 0,
    regions: extractRegionsFromMask(maskOnly, width, height),
    width,
    height,
  };
}
