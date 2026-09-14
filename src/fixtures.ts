import type { PageLines } from './pdf/extract';
import { parseReport } from './parser';
import { FULL_LINE, buildLine } from './format/line';

/** Shape of src/__fixtures__/*.json: anonymised report lines plus what the pipeline must print for them. */
export interface Fixture {
  pages: PageLines[];
  expected: { line: string; full: string };
}

/** The single definition of "expected output", shared by the fixture generator and the regression test. */
export function expectedFor(pages: PageLines[]): Fixture['expected'] {
  const report = parseReport(pages);
  return { line: buildLine(report), full: buildLine(report, FULL_LINE) };
}
