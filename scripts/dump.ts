/**
 * Dev helper: node script to inspect what the pipeline sees for a PDF.
 *
 *   npx tsx scripts/dump.ts <file.pdf> [lines|items|line|full]
 */
import { readFileSync } from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractLines } from '../src/pdf/extract';
import { parseReport } from '../src/parser';
import { buildLine, toEntries } from '../src/format/line';

const [, , file, mode = 'line'] = process.argv;
if (!file) {
  console.error('usage: dump.ts <file.pdf> [lines|items|line|full]');
  process.exit(1);
}

const pages = await extractLines(new Uint8Array(readFileSync(file)), pdfjs);

if (mode === 'lines') {
  for (const p of pages) {
    console.log(`\n===== page ${p.page}`);
    for (const l of p.lines) console.log(l);
  }
} else {
  const report = parseReport(pages);
  if (mode === 'items') {
    console.log(`lab=${report.lab} patient=${report.patient} collected=${report.collectedAt}`);
    for (const e of toEntries(report)) {
      const flag = e.duplicate ? 'dup' : e.known ? (e.optional ? 'opt' : '   ') : '???';
      console.log(
        `${flag} ${e.abbr.padEnd(24)} ${e.value.padEnd(10)} | p${e.item.page} ${e.item.exam} > ${e.item.label} [${e.item.values.map((m) => [m.value, m.unit].filter(Boolean).join(' ')).join(' | ')}]`,
      );
    }
    for (const w of report.warnings) console.log('WARN', w);
  } else {
    console.log(buildLine(report, { full: mode === 'full', includeUnknown: mode === 'full' }));
  }
}
