import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderStandaloneViewerHtml } from '../src/visual/standalone-viewer.ts';

const dir = process.argv[2];
if (!dir) throw new Error('usage: rerender-report.mts <run-dir>');
const report = JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8'));
writeFileSync(join(dir, 'index.html'), renderStandaloneViewerHtml(report));
console.log('wrote', join(dir, 'index.html'));
