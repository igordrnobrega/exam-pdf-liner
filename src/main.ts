import './pdf/stream-polyfill';
import * as pdfjs from 'pdfjs-dist';
import { extractLines } from './pdf/extract';
import { parseReport, type ParsedReport } from './parser';
import { buildLine, toEntries } from './format/line';

pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL('./pdf/worker.ts', import.meta.url), {
  type: 'module',
});

interface Result {
  name: string;
  report?: ParsedReport;
  error?: string;
}

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const drop = $<HTMLLabelElement>('#drop');
const fileInput = $<HTMLInputElement>('#file');
const resultsEl = $<HTMLElement>('#results');
const optFull = $<HTMLInputElement>('#opt-full');
const optUnknown = $<HTMLInputElement>('#opt-unknown');

const results: Result[] = [];

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
drop.addEventListener('drop', (e) => {
  const files = Array.from(e.dataTransfer?.files ?? []).filter((f) =>
    /\.pdf$/i.test(f.name) || f.type === 'application/pdf',
  );
  if (files.length) void processFiles(files);
});

optFull.addEventListener('change', render);
optUnknown.addEventListener('change', render);

export async function processFiles(files: File[]): Promise<void> {
  for (const file of files) {
    const entry: Result = { name: file.name };
    results.unshift(entry);
    render();
    try {
      const pages = await extractLines(await file.arrayBuffer(), pdfjs);
      entry.report = parseReport(pages);
      if (entry.report.items.length === 0) entry.error = 'Nenhum resultado encontrado neste PDF.';
    } catch (err) {
      entry.error = err instanceof Error ? err.message : String(err);
    }
    render();
  }
}

declare global {
  interface Window {
    /** Dev only: feed File objects from the devtools console. */
    processFiles?: typeof processFiles;
  }
}
if (import.meta.env.DEV) window.processFiles = processFiles;

function render(): void {
  const opts = { full: optFull.checked, includeUnknown: optUnknown.checked };
  resultsEl.replaceChildren(
    ...results.map((r) => {
      const card = el('article', 'card');
      const head = el('div', 'card-head');
      head.append(el('h2', 'card-title', r.name));
      if (r.report) head.append(el('span', 'badge', r.report.lab));
      card.append(head);

      if (r.error) card.append(el('p', 'error', r.error));
      if (!r.report) {
        if (!r.error) card.append(el('p', 'muted', 'Processando…'));
        return card;
      }

      const line = buildLine(r.report, opts);
      const ta = document.createElement('textarea');
      ta.className = 'line';
      ta.value = line;
      ta.rows = Math.max(3, Math.ceil(line.length / 110));
      card.append(ta);

      const actions = el('div', 'actions');
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'btn';
      copy.textContent = 'Copiar';
      copy.addEventListener('click', async () => {
        await navigator.clipboard.writeText(ta.value);
        copy.textContent = 'Copiado ✓';
        setTimeout(() => (copy.textContent = 'Copiar'), 1500);
      });
      actions.append(copy);
      actions.append(el('span', 'muted', `${r.report.items.length} valores extraídos`));
      card.append(actions);

      for (const w of r.report.warnings) card.append(el('p', 'warn', w));

      card.append(detailsTable(r.report));
      return card;
    }),
  );
}

function detailsTable(report: ParsedReport): HTMLElement {
  const details = document.createElement('details');
  details.append(el('summary', '', 'Ver itens extraídos'));
  const table = document.createElement('table');
  table.className = 'items';
  const thead = table.createTHead();
  const hr = thead.insertRow();
  for (const h of ['Abrev.', 'Valor', 'Exame', 'Rótulo original', 'Unidade', 'Pág.']) {
    const th = document.createElement('th');
    th.textContent = h;
    hr.append(th);
  }
  const tbody = table.createTBody();
  for (const e of toEntries(report)) {
    const tr = tbody.insertRow();
    tr.className = e.known ? (e.optional ? 'row-optional' : '') : 'row-unknown';
    for (const v of [
      e.known ? e.abbr : `? ${e.abbr}`,
      e.value,
      e.item.exam,
      e.item.label,
      e.unit ?? '',
      String(e.item.page),
    ]) {
      tr.insertCell().textContent = v;
    }
  }
  details.append(table);
  return details;
}

function el(tag: string, cls: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}
