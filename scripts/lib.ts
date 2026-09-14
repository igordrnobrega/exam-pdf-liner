import { readFileSync } from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractLines, type PageLines } from '../src/pdf/extract';

/** Reads a PDF from disk through the same extractor the browser uses (Node needs pdf.js's legacy build). */
export function readPdfLines(path: string): Promise<PageLines[]> {
  // pdf.js rejects a Node Buffer; hand it a plain Uint8Array.
  return extractLines(new Uint8Array(readFileSync(path)), pdfjs);
}
