import { describe, expect, it } from 'vitest';
import { parseReport } from './parser';
import { buildLine } from './format/line';
import sabinAmbulatorial from './__fixtures__/sabin-ambulatorial.json';
import sabinInternacao from './__fixtures__/sabin-internacao.json';
import sabinProntoSocorro from './__fixtures__/sabin-pronto-socorro.json';
import dasaDf from './__fixtures__/dasa-df.json';
import dasaSp from './__fixtures__/dasa-sp.json';

// Anonymised line dumps of real reports (scripts/make-fixture.ts). If a change
// alters the expected output on purpose, regenerate the fixture from the PDF.
const fixtures = { sabinAmbulatorial, sabinInternacao, sabinProntoSocorro, dasaDf, dasaSp };

describe.each(Object.entries(fixtures))('fixture %s', (_name, fixture) => {
  const report = parseReport(fixture.pages);

  it('produces the expected default line', () => {
    expect(buildLine(report)).toBe(fixture.expected.line);
  });

  it('produces the expected full line', () => {
    expect(buildLine(report, { full: true, includeUnknown: true })).toBe(fixture.expected.full);
  });

  it('has no warnings', () => {
    expect(report.warnings).toEqual([]);
  });
});
