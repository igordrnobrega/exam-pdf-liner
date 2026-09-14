import { describe, expect, it } from 'vitest';
import { parseReport } from './parser';
import { expectedFor, type Fixture } from './fixtures';

// Every anonymised report dump under src/__fixtures__ (scripts/make-fixture.ts)
// is a regression test; dropping a new JSON there is enough to include it. If a
// change alters the expected output on purpose, regenerate the fixture from the PDF.
const fixtures = import.meta.glob('./__fixtures__/*.json', { eager: true, import: 'default' }) as Record<
  string,
  Fixture
>;

describe.each(Object.entries(fixtures))('fixture %s', (_path, fixture) => {
  it('prints the expected default and full lines', () => {
    expect(expectedFor(fixture.pages)).toEqual(fixture.expected);
  });

  it('is recognised as a known layout', () => {
    expect(parseReport(fixture.pages).warning).toBeUndefined();
  });
});
