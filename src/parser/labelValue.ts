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
 * (what to skip, what counts as a result, what starts/ends an exam) comes
 * from Layout.
 */

// Numeric token as printed: "11,3", "3.660", "1.576,0", "-6,2", "> 2.000".
const NUM = String.raw`[<>]?\s?-?\d+(?:[.,]\d+)*`;
const NUM_RE = new RegExp(`^${NUM}$`);

// "LABEL....: 11,3 g/dL 12,0 a 15,8" or "LABEL 11,3 g/dL ...". Group 2 captures
// the colon, when there is one. Labels may carry charge signs ("Na+", "Ca++").
// The number may carry a flag ("128*") or a glued unit ("92mg/dL"); dates,
// times and document numbers ("03/09/2026", "577-67816") still fail the lookahead.
const ROW = new RegExp(
  String.raw`^([A-Za-zÀ-ÿ*][A-Za-zÀ-ÿ0-9 ()\-/.,*ªº³^+=&≥≤]*?)(?:\s*\.*\s*(:)\s*|\s+)(${NUM})\*?(?=\s|$|[A-Za-zµμ%])\s*(.*)$`,
);

/**
 * Units a result may carry, as printed. Each maps to a canonical unit and the
 * factor that rescales the printed value into it ("85 x 10³/mm3" → "85.000 /mm3"),
 * so downstream code never has to know how a lab spells "thousands per µL".
 * Keys are normalised with normUnit at start-up; write them naturally.
 */
const UNIT_TABLE: Record<string, { unit: string; factor?: number }> = {
  '%': { unit: '%' },
  '/µL': { unit: '/µl' },
  '/mm3': { unit: '/mm3' },
  'mil/mm3': { unit: '/mm3', factor: 1000 },
  'x 10³/mm3': { unit: '/mm3', factor: 1000 },
  'x 10³/µL': { unit: '/µl', factor: 1000 },
  '10^3/µL': { unit: '/µl', factor: 1000 },
  '10³/µL': { unit: '/µl', factor: 1000 },
  '10^6/µL': { unit: '10^6/µl' },
  'milhões/mm3': { unit: 'milhões/mm3' },
  'g/dL': { unit: 'g/dl' },
  'g/L': { unit: 'g/l' },
  'mg/dL': { unit: 'mg/dl' },
  'mg/L': { unit: 'mg/l' },
  'mg/g': { unit: 'mg/g' },
  'µg/dL': { unit: 'µg/dl' },
  'µg/L': { unit: 'µg/l' },
  'mcg/dL': { unit: 'µg/dl' },
  'mcg/mL': { unit: 'µg/ml' },
  'ng/mL': { unit: 'ng/ml' },
  'ng/dL': { unit: 'ng/dl' },
  'ng/L': { unit: 'ng/l' },
  'ng/mL FEU': { unit: 'ng/ml feu' },
  'pg/mL': { unit: 'pg/ml' },
  'pg': { unit: 'pg' },
  'fL': { unit: 'fl' },
  'mmol/L': { unit: 'mmol/l' },
  'µmol/L': { unit: 'µmol/l' },
  'nmol/L': { unit: 'nmol/l' },
  'pmol/L': { unit: 'pmol/l' },
  'mEq/L': { unit: 'meq/l' },
  'U/L': { unit: 'u/l' },
  'U/mL': { unit: 'u/ml' },
  'UI/L': { unit: 'ui/l' },
  'UI/mL': { unit: 'ui/ml' },
  'mUI/L': { unit: 'mui/l' },
  'mUI/mL': { unit: 'mui/ml' },
  'µUI/mL': { unit: 'µui/ml' },
  'µU/mL': { unit: 'µu/ml' },
  'mL/min/1,73m2': { unit: 'ml/min/1,73m2' },
  'mm/1h': { unit: 'mm/1h' },
  'mmHg': { unit: 'mmhg' },
  'segundos': { unit: 's' },
  'seg': { unit: 's' },
  's': { unit: 's' },
};

// Greek mu (U+03BC, what pdf.js yields for Sabin) vs micro sign (U+00B5); superscripts vary by lab.
const normUnit = (tokens: string[]) =>
  tokens.join(' ').toLowerCase().replace(/μ/g, 'µ').replace(/²/g, '2').replace(/³/g, '3');

const UNITS = new Map(Object.entries(UNIT_TABLE).map(([k, v]) => [normUnit([k]), v]));

// Signatures and professional registrations show up in every layout's footer.
const COMMON_SKIP = [/^[0-9A-Fa-f]{40,}$/, /\b(CRM|CRBM|CRF)\b/];
const COLLECTED_RE = /Coleta[^:]*:\s*(\d{2}\/\d{2}\/\d{4})/i;

// Result rows are short; a hostile PDF could carry a huge single line that
// makes the backtracking ROW regex crawl on the main thread.
const MAX_ROW_LENGTH = 500;

export function parseLabelValue(pages: PageLines[], layout: Layout): ParsedReport {
  const report: ParsedReport = { lab: layout.lab, items: [], warning: layout.warning };
  const skip = [...COMMON_SKIP, ...layout.skip];
  let exam = '';

  for (const page of pages) {
    const lines = page.lines.map((l) => l.trim()).filter(Boolean);
    if (layout.skipPage && lines.some((l) => layout.skipPage!.test(l))) continue;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      captureMeta(report, line, layout);
      if (layout.endsExam?.test(line)) exam = '';
      if (skip.some((re) => re.test(line))) continue;

      const row = parseRow(line, layout);
      if (row) {
        report.items.push({ ...row, exam: exam || row.label, page: page.page });
      } else if (layout.isTitle(line, lines[i + 1] ?? '')) {
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
  if (line.length > MAX_ROW_LENGTH) return null;
  const m = ROW.exec(line);
  if (!m) return null;
  const [, rawLabel, colon, first, rest] = m;
  const label = rawLabel.replace(/[.\s]+$/g, '').replace(/\s+/g, ' ').trim();
  const values = readMeasurements([first, ...rest.split(/\s+/).filter(Boolean)]);
  return layout.accepts({ label, colon: !!colon, values }) ? { label, values } : null;
}

/**
 * Reads leading "number [unit]" pairs: "56 2.049 40-70" → [56], [2.049];
 * "85 x 10³/mm3 130 a 450" → [85.000 /mm3], [130]. Stops at the first token
 * that is neither a number nor a known unit.
 */
function readMeasurements(tokens: string[]): Measurement[] {
  const out: Measurement[] = [];
  let i = 0;
  while (i < tokens.length && NUM_RE.test(tokens[i])) {
    const m: Measurement = { value: tokens[i++].replace(/\s+/g, '') };
    const unit = readUnit(tokens, i);
    if (unit) {
      const spec = UNITS.get(normUnit(tokens.slice(i, i + unit)))!;
      m.unit = spec.unit;
      if (spec.factor) m.value = scale(m.value, spec.factor);
      i += unit;
    }
    out.push(m);
  }
  return out;
}

/** Number of tokens at `start` that spell a known unit (longest match), or 0. */
function readUnit(tokens: string[], start: number): number {
  for (let n = 3; n >= 1; n--) {
    if (start + n <= tokens.length && UNITS.has(normUnit(tokens.slice(start, start + n)))) return n;
  }
  return 0;
}

/** "85" ×1000 → "85.000"; keeps a leading "<"/">" ("<10" → "<10.000"). */
function scale(value: string, factor: number): string {
  const m = /^([<>]?)(-?[\d.,]+)$/.exec(value);
  if (!m) return value;
  const n = Number(m[2].replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(n)) return value;
  return m[1] + (n * factor).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}
