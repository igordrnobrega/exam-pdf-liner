import type * as PdfJs from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';

export interface PageLines {
  page: number;
  lines: string[];
}

type PdfJsModule = Pick<typeof PdfJs, 'getDocument'>;

/**
 * Extracts text from every page of a PDF and reconstructs lines from the
 * positioned text runs. The pdf.js module is injected so the same code runs
 * in the browser (standard build) and in Node (legacy build).
 */
export async function extractLines(
  data: ArrayBuffer | Uint8Array,
  pdfjs: PdfJsModule,
): Promise<PageLines[]> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  // Text extraction never renders, so embedded fonts are not loaded into the
  // page (one less thing a hostile PDF can feed the browser).
  const task = pdfjs.getDocument({ data: bytes, disableFontFace: true });
  try {
    const doc = await task.promise;
    const pages: PageLines[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const items = content.items.filter(
        (i): i is TextItem => 'str' in i && i.str.trim() !== '',
      );
      pages.push({ page: p, lines: itemsToLines(items) });
      page.cleanup();
    }
    return pages;
  } finally {
    // Frees the worker-side document (bytes, xref, fonts); the shared worker port survives.
    await task.destroy();
  }
}

interface Run {
  x: number;
  w: number;
  s: string;
}

interface Row {
  y: number;
  runs: Run[];
}

/** Groups text runs by baseline (y) and joins them left-to-right into lines. */
export function itemsToLines(items: TextItem[]): string[] {
  const rows: Row[] = [];
  for (const it of items) {
    const x = it.transform[4];
    const y = it.transform[5];
    const h = it.height || Math.abs(it.transform[3]) || 8;
    const tol = Math.max(1.5, h * 0.35);
    let row = rows.find((r) => Math.abs(r.y - y) <= tol);
    if (!row) {
      row = { y, runs: [] };
      rows.push(row);
    }
    row.runs.push({ x, w: it.width, s: it.str });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((row) => {
    row.runs.sort((a, b) => a.x - b.x);
    let out = '';
    let endX = -Infinity;
    for (const run of row.runs) {
      if (out) {
        const charW = run.w / Math.max(1, run.s.length);
        const gap = run.x - endX;
        if (gap > charW * 0.4 && !out.endsWith(' ') && !run.s.startsWith(' ')) out += ' ';
      }
      out += run.s;
      endX = run.x + run.w;
    }
    return out.replace(/\s+/g, ' ').trim();
  });
}
