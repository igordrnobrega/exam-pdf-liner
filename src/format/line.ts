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
  item: ExamItem;
}

/** Items in output order: recognised ones by rule position, then unknown ones in document order. */
export function toEntries(report: ParsedReport): LineEntry[] {
  return report.items
    .flatMap((item, docIndex) => {
      if (isIgnored(item)) return [];
      const index = findRuleIndex(item);
      const known = index >= 0;
      const rule = known ? RULES[index] : fallbackRule(item);
      const order = known ? index : RULES.length + docIndex;
      return [{ order, entry: toEntry(rule, item, known) }];
    })
    .sort((a, b) => a.order - b.order)
    .map((e) => e.entry);
}

function toEntry(rule: Rule, item: ExamItem, known: boolean): LineEntry {
  const m = rule.pick?.(item.values) ?? item.values[0];
  let value = rule.transform ? rule.transform(m) : m.value;
  if (rule.suffix && !value.endsWith(rule.suffix)) value += rule.suffix;
  return {
    abbr: rule.abbr,
    value,
    unit: m.unit,
    group: rule.group?.(item),
    optional: !!rule.optional,
    known,
    item,
  };
}

export function buildLine(report: ParsedReport, opts: LineOptions = {}): string {
  const entries = toEntries(report).filter(
    (e) => (opts.full || !e.optional) && (opts.includeUnknown || e.known),
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
