import type { PageLines } from '../pdf/extract';
import type { ParsedReport } from './types';
import { parseLabelValue } from './labelValue';
import { LAYOUTS, UNKNOWN } from './layouts';

export type { ExamItem, Measurement, ParsedReport } from './types';

export function parseReport(pages: PageLines[]): ParsedReport {
  // Whole document: DASA only names itself in the execution-site footer of the last page.
  const text = pages.map((p) => p.lines.join('\n')).join('\n');
  const layout = LAYOUTS.find((l) => l.detect.test(text)) ?? UNKNOWN;
  return parseLabelValue(pages, layout);
}
