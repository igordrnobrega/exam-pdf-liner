import type { ExamItem, ParsedReport } from '../parser/types';
import { RULES, fallbackRule, findRuleIndex, isIgnored, type Rule } from './rules';

export interface LineOptions {
  /** Include optional items (HCM, CHCM, differential, etc.). */
  full?: boolean;
  /** Include items no rule recognises, using their printed label. */
  includeUnknown?: boolean;
}

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
 * document order. When the same rule matches twice (two hemograms in one
 * report) the first occurrence wins and the rest are flagged as duplicates.
 * Items whose rule cannot pick a value (a differential row missing its
 * absolute count) are left out rather than printed with the wrong number.
 */
export function toEntries(report: ParsedReport): LineEntry[] {
  const seen = new Set<number>();
  return report.items
    .flatMap((item, docIndex) => {
      if (isIgnored(item)) return [];
      const index = findRuleIndex(item);
      const known = index >= 0;
      const rule = known ? RULES[index] : fallbackRule(item);
      const entry = toEntry(rule, item, known, known && seen.has(index));
      if (!entry) return [];
      if (known) seen.add(index);
      return [{ order: known ? index : RULES.length + docIndex, entry }];
    })
    .sort((a, b) => a.order - b.order)
    .map((e) => e.entry);
}

function toEntry(rule: Rule, item: ExamItem, known: boolean, duplicate: boolean): LineEntry | null {
  const m = rule.pick ? rule.pick(item.values) : item.values[0];
  if (!m) return null;
  let value = m.value;
  if (rule.suffix && !value.endsWith(rule.suffix)) value += rule.suffix;
  return {
    abbr: rule.abbr,
    value,
    unit: m.unit,
    group: rule.group?.(item),
    optional: !!rule.optional,
    known,
    duplicate,
    item,
  };
}

export function buildLine(report: ParsedReport, opts: LineOptions = {}): string {
  const entries = toEntries(report).filter(
    (e) => !e.duplicate && (opts.full || !e.optional) && (opts.includeUnknown || e.known),
  );
  const parts: string[] = [];
  let currentGroup: string | undefined;
  for (const e of entries) {
    if (e.group && e.group !== currentGroup) parts.push(e.group);
    currentGroup = e.group;
    parts.push(`${e.abbr} ${e.value}`);
  }
  const header = [report.patient, report.collectedAt].filter(Boolean).join(' – ');
  const body = parts.join(' ');
  if (!body) return header;
  return header ? `${header}: ${body}.` : `${body}.`;
}
