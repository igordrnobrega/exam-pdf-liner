import type { ExamItem, Measurement, ParsedReport } from './types';
import type { Layout } from './layouts';
import type { PageLines } from '../pdf/extract';

/**
 * Generic parser for lab reports printed as "label + number(s) [unit]" rows:
 *
 *   EXAM TITLE
 *   RÓTULO....: 11,3 g/dL
 *   HEMOGLOBINA 11,3 g/dL 12,0 a 15,8
 *   Hemoglobina 7,4 g/dL 13,0 a 17,0 g/dL
 *
 * It walks the lines page by page, remembers the current exam title and
 * collects every accepted row. Anything that depends on the laboratory
 * (what to skip, what counts as a result, what is a title) comes from Layout.
 */

// Numeric token as printed: "11,3", "3.660", "1.576,0", "-6,2", "> 2.000".
const NUM = String.raw`[<>]?\s?-?\d+(?:[.,]\d+)*`;
const NUM_RE = new RegExp(`^${NUM}$`);

// "LABEL....: 11,3 g/dL 12,0 a 15,8" or "LABEL 11,3 g/dL ...". Group 2 captures
// the colon, when there is one.
const ROW = new RegExp(
  String.raw`^([A-Za-zÀ-ÿ*][A-Za-zÀ-ÿ0-9 ()\-/.,*ªº³^]*?)(?:\s*\.*\s*(:)\s*|\s+)(${NUM})(?=\s|$)\s*(.*)$`,
);

// Units a result may carry, lowercase. Multi-token units are matched token by token.
const UNITS = [
  '%', '/µl', '/mm3', 'milhões/mm3', 'x 10³/mm3', '10^6/µl', '10^3/µl', '10³/µl',
  'g/dl', 'g/l', 'mg/dl', 'mg/l', 'mg/g', 'µg/dl', 'µg/l', 'ng/ml', 'ng/dl', 'ng/l', 'ng/ml feu',
  'pg/ml', 'pg', 'fl', 'mmol/l', 'meq/l', 'nmol/l', 'pmol/l',
  'u/l', 'ui/l', 'ui/ml', 'µui/ml', 'mui/l', 'ml/min/1,73m2', 'mm/1h', 'mmhg', 'segundos',
];

// Signatures and professional registrations show up in every layout's footer.
const COMMON_SKIP = [/^[0-9A-Fa-f]{40,}$/, /\b(CRM|CRBM|CRF)\b/];
const COLLECTED_RE = /Coleta[^:]*:\s*(\d{2}\/\d{2}\/\d{4})/i;

export function parseLabelValue(pages: PageLines[], layout: Layout): ParsedReport {
  const report: ParsedReport = {
    lab: layout.lab,
    items: [],
    warnings: layout.warning ? [layout.warning] : [],
  };
  let exam = '';

  for (const page of pages) {
    const lines = page.lines.map((l) => l.trim()).filter(Boolean);
    if (layout.skipPage && lines.some((l) => layout.skipPage!.test(l))) continue;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      captureMeta(report, line, layout);
      if ([...COMMON_SKIP, ...layout.skip].some((re) => re.test(line))) continue;

      const row = parseRow(line, layout);
      if (row) {
        report.items.push({ ...row, exam: exam || row.label, page: page.page });
      } else if (layout.isTitle(line, lines.slice(i + 1, i + 4))) {
        exam = line;
      }
    }
  }
  return report;
}

function captureMeta(report: ParsedReport, line: string, layout: Layout): void {
  for (const re of layout.patient) report.patient ??= re.exec(line)?.[1];
  report.collectedAt ??= COLLECTED_RE.exec(line)?.[1];
}

function parseRow(line: string, layout: Layout): Pick<ExamItem, 'label' | 'values'> | null {
  const m = ROW.exec(line);
  if (!m) return null;
  const [, rawLabel, colon, first, rest] = m;
  const label = rawLabel.replace(/[.\s]+$/g, '').replace(/\s+/g, ' ').trim();
  const values = readMeasurements([first, ...rest.split(/\s+/).filter(Boolean)]);
  return layout.accepts({ label, colon: !!colon, values }) ? { label, values } : null;
}

/**
 * Reads leading "number [unit]" pairs: "56 2.049 40-70" → [56], [2.049];
 * "85 x 10³/mm3 130 a 450" → [85 x 10³/mm3], [130]. Stops at the first token
 * that is neither a number nor (the start of) a unit.
 */
function readMeasurements(tokens: string[]): Measurement[] {
  const out: Measurement[] = [];
  let i = 0;
  while (i < tokens.length && NUM_RE.test(tokens[i])) {
    const m: Measurement = { value: tokens[i++].replace(/\s+/g, '') };
    const unit: string[] = [];
    while (i < tokens.length && isUnitPrefix([...unit, tokens[i]])) unit.push(tokens[i++]);
    if (unit.length && isUnit(unit)) m.unit = unit.join(' ');
    out.push(m);
  }
  return out;
}

// Greek mu (U+03BC, what pdf.js yields for Sabin) vs micro sign (U+00B5); DASA prints "m²".
const normUnit = (tokens: string[]) => tokens.join(' ').toLowerCase().replace(/μ/g, 'µ').replace('m²', 'm2');

const isUnit = (tokens: string[]) => UNITS.includes(normUnit(tokens));

const isUnitPrefix = (tokens: string[]) => {
  const joined = normUnit(tokens);
  return UNITS.some((u) => u === joined || u.startsWith(joined + ' '));
};
