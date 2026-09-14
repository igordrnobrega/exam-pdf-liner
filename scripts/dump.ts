/**
 * Dev helper: node script to inspect what the pipeline sees for a PDF.
 *
 *   npx tsx scripts/dump.ts <file.pdf> [lines|items|line|full]
 */
import { readPdfLines } from './lib';
import { parseReport } from '../src/parser';
import { FULL_LINE, buildLine, toEntries } from '../src/format/line';

const [, , file, mode = 'line'] = process.argv;
if (!file) {
  console.error('usage: dump.ts <file.pdf> [lines|items|line|full]');
  process.exit(1);
}

const pages = await readPdfLines(file);

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
      const values = e.item.values.map((m) => [m.value, m.unit].filter(Boolean).join(' ')).join(' | ');
      console.log(`${flag} ${e.abbr.padEnd(24)} ${e.value.padEnd(10)} | p${e.item.page} ${e.item.exam} > ${e.item.label} [${values}]`);
    }
    if (report.warning) console.log('WARN', report.warning);
  } else {
    console.log(buildLine(report, mode === 'full' ? FULL_LINE : {}));
  }
}
