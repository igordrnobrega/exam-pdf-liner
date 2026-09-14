import './pdf/stream-polyfill';
import * as pdfjs from 'pdfjs-dist';
import { extractLines } from './pdf/extract';
import { parseReport, type ParsedReport } from './parser';
import { buildLine, toEntries, type LineOptions } from './format/line';
import { track } from './analytics';

const worker = new Worker(new URL('./pdf/worker.ts', import.meta.url), { type: 'module' });
pdfjs.GlobalWorkerOptions.workerPort = worker;

// If the worker script fails to load (stale cache, blocked script), pdf.js waits
// forever for it; race extraction against that failure so the user sees why.
const workerFailure = new Promise<never>((_, reject) => {
  worker.addEventListener('error', (e) => {
    reject(new Error(`Falha ao carregar o processador de PDF (${e.message || 'worker'}). Recarregue a página limpando o cache.`));
  });
});

/** One dropped file: its card is created once and updated in place. */
interface Result {
  card: HTMLElement;
  report?: ParsedReport;
  /** Editable line; `dirty` once the user has typed in it, after which options no longer overwrite it. */
  line?: HTMLTextAreaElement;
  dirty: boolean;
}

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const drop = $<HTMLLabelElement>('#drop');
const fileInput = $<HTMLInputElement>('#file');
const resultsEl = $<HTMLElement>('#results');
const optFull = $<HTMLInputElement>('#opt-full');
const optUnknown = $<HTMLInputElement>('#opt-unknown');

const results: Result[] = [];

const options = (): LineOptions => ({ full: optFull.checked, includeUnknown: optUnknown.checked });

fileInput.addEventListener('change', () => {
  if (fileInput.files) void processFiles(Array.from(fileInput.files));
  fileInput.value = '';
});

for (const evt of ['dragenter', 'dragover']) {
  drop.addEventListener(evt, (e) => {
    e.preventDefault();
    drop.classList.add('drop--over');
  });
}
for (const evt of ['dragleave', 'drop']) {
  drop.addEventListener(evt, (e) => {
    e.preventDefault();
    drop.classList.remove('drop--over');
  });
}
// A PDF dropped anywhere on the page is processed; outside the drop zone the
// browser's default would navigate away and lose every result.
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
  e.preventDefault();
  const files = Array.from(e.dataTransfer?.files ?? []).filter((f) =>
    /\.pdf$/i.test(f.name) || f.type === 'application/pdf',
  );
  if (files.length) void processFiles(files);
});

for (const opt of [optFull, optUnknown]) {
  opt.addEventListener('change', () => {
    for (const r of results) {
      if (r.report && r.line && !r.dirty) setLine(r.line, buildLine(r.report, options()));
    }
  });
}

export async function processFiles(files: File[]): Promise<void> {
  for (const file of files) {
    const card = el('article', 'card');
    card.append(el('div', 'card-head', el('h2', 'card-title', file.name)));
    const status = el('p', 'muted', 'Processando…');
    card.append(status);
    resultsEl.prepend(card);
    const result: Result = { card, dirty: false };
    results.push(result);

    const started = performance.now();
    try {
      const pages = await Promise.race([extractLines(await file.arrayBuffer(), pdfjs), workerFailure]);
      result.report = parseReport(pages);
      status.remove();
      fillCard(result, result.report);
      const entries = toEntries(result.report);
      track('pdf_processed', {
        lab: result.report.lab,
        pages: pages.length,
        items: result.report.items.length,
        known: entries.filter((e) => e.known && !e.duplicate).length,
        unknown: entries.filter((e) => !e.known).length,
        ms: Math.round(performance.now() - started),
      });
    } catch (err) {
      status.className = 'error';
      status.textContent = err instanceof Error ? err.message : String(err);
      track('pdf_failed', { reason: err instanceof Error ? err.name : 'unknown', ms: Math.round(performance.now() - started) });
    }
  }
}

declare global {
  interface Window {
    /** Dev only: feed File objects from the devtools console. */
    processFiles?: typeof processFiles;
  }
}
if (import.meta.env.DEV) window.processFiles = processFiles;

function fillCard(result: Result, report: ParsedReport): void {
  const { card } = result;
  card.querySelector('.card-head')?.append(el('span', 'badge', report.lab));
  if (report.items.length === 0) card.append(el('p', 'error', 'Nenhum resultado encontrado neste PDF.'));

  const ta = document.createElement('textarea');
  ta.className = 'line';
  ta.addEventListener('input', () => (result.dirty = true));
  setLine(ta, buildLine(report, options()));
  result.line = ta;
  card.append(ta);

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'btn';
  copy.textContent = 'Copiar';
  copy.addEventListener('click', async () => {
    const ok = await copyText(ta);
    if (ok) track('copy', { lab: report.lab, chars: ta.value.length, edited: result.dirty });
    copy.textContent = ok ? 'Copiado ✓' : 'Selecionado: use Ctrl+C / ⌘C';
    setTimeout(() => (copy.textContent = 'Copiar'), ok ? 1500 : 4000);
  });
  card.append(el('div', 'actions', copy, el('span', 'muted', `${report.items.length} valores extraídos`)));

  if (report.warning) card.append(el('p', 'warn', report.warning));
  card.append(detailsTable(report));
}

/**
 * Copies the line. navigator.clipboard only exists in secure contexts (HTTPS,
 * localhost); on plain http the text is left selected so a keyboard copy works.
 */
async function copyText(ta: HTMLTextAreaElement): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(ta.value);
      return true;
    }
  } catch {
    // permission denied or no clipboard: fall through to selection
  }
  ta.focus();
  ta.select();
  return false;
}

function setLine(ta: HTMLTextAreaElement, line: string): void {
  ta.value = line;
  ta.rows = Math.max(3, Math.ceil(line.length / 110));
}

function detailsTable(report: ParsedReport): HTMLElement {
  const details = document.createElement('details');
  details.append(el('summary', '', 'Ver itens extraídos'));
  const table = document.createElement('table');
  table.className = 'items';
  const hr = table.createTHead().insertRow();
  for (const h of ['Abrev.', 'Valor', 'Exame', 'Rótulo original', 'Unidade', 'Pág.']) {
    hr.append(el('th', '', h));
  }
  const tbody = table.createTBody();
  for (const e of toEntries(report)) {
    const tr = tbody.insertRow();
    tr.className = e.duplicate ? 'row-duplicate' : e.known ? (e.optional ? 'row-optional' : '') : 'row-unknown';
    const cells = [
      e.known ? e.abbr : `? ${e.abbr}`,
      e.duplicate ? `${e.value} (repetido)` : e.value,
      e.item.exam,
      e.item.label,
      e.unit ?? '',
      String(e.item.page),
    ];
    for (const v of cells) tr.insertCell().textContent = v;
  }
  details.append(table);
  return details;
}

function el(tag: string, cls: string, ...children: (string | Node)[]): HTMLElement {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  node.append(...children);
  return node;
}
