import type { ExamItem, ParsedReport } from '../parser/types';
import { RULES, fallbackRule, findRuleIndex, isIgnored, type PrintRule } from './rules';

export interface LineOptions {
  /** Include optional items (HCM, CHCM, differential, etc.). */
  full?: boolean;
  /** Include items no rule recognises, using their printed label. */
  includeUnknown?: boolean;
}

/** Everything the report has: optional and unknown items included. */
export const FULL_LINE: LineOptions = { full: true, includeUnknown: true };

export interface LineEntry {
  abbr: string;
  value: string;
  unit?: string;
  group?: string;
  optional: boolean;
  /** Matched a rule (false: printed under its own label, only on request). */
  known: boolean;
  /** A later occurrence of an analyte already printed; shown in the table, never in the line. */
  duplicate: boolean;
  item: ExamItem;
}

/**
 * Items in output order: recognised ones by rule position, then unknown ones in
 * document order. When the same rule matches twice within the same group (two
 * hemograms in one report) the first occurrence wins and the rest are flagged
 * as duplicates; the same analyte in different groups (arterial and venous pH)
 * is not a duplicate. Items whose rule cannot pick a value (a differential row
 * missing its absolute count) are left out rather than printed with the wrong
 * number.
 */
export function toEntries(report: ParsedReport): LineEntry[] {
  const seen = new Set<string>();
  return report.items
    .flatMap((item, docIndex) => {
      if (isIgnored(item)) return [];
      const index = findRuleIndex(item);
      const known = index >= 0;
      const rule = known ? RULES[index] : fallbackRule(item);
      const group = rule.group?.(item);
      const key = `${index}|${group ?? ''}`;
      const entry = toEntry(rule, item, known, group, known && seen.has(key));
      if (!entry) return [];
      if (known) seen.add(key);
      return [{ order: known ? index : RULES.length + docIndex, entry }];
    })
    .sort((a, b) => a.order - b.order)
    .map((e) => e.entry);
}

function toEntry(
  rule: PrintRule,
  item: ExamItem,
  known: boolean,
  group: string | undefined,
  duplicate: boolean,
): LineEntry | null {
  const m = rule.pick ? rule.pick(item.values) : item.values[0];
  if (!m) return null;
  let value = m.value;
  if (rule.suffix && !value.endsWith(rule.suffix)) value += rule.suffix;
  return { abbr: rule.abbr, value, unit: m.unit, group, optional: !!rule.optional, known, duplicate, item };
}

/**
 * The one-line summary. Grouped entries (gasometria) are printed together
 * under their group prefix at the position of the group's first entry, so
 * "GSA pH pCO2 ... GSV pH pCO2 ..." never interleave.
 */
export function buildLine(report: ParsedReport, opts: LineOptions = {}): string {
  const entries = toEntries(report).filter(
    (e) => !e.duplicate && (opts.full || !e.optional) && (opts.includeUnknown || e.known),
  );
  const parts: string[] = [];
  const emittedGroups = new Set<string>();
  for (const e of entries) {
    if (!e.group) {
      parts.push(`${e.abbr} ${e.value}`);
    } else if (!emittedGroups.has(e.group)) {
      emittedGroups.add(e.group);
      parts.push(e.group, ...entries.filter((x) => x.group === e.group).map((x) => `${x.abbr} ${x.value}`));
    }
  }
  const header = [report.patient, report.collectedAt].filter(Boolean).join(' – ');
  const body = parts.join(' ');
  if (!body) return header;
  return header ? `${header}: ${body}.` : `${body}.`;
}
