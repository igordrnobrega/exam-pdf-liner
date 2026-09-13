// pdf.js worker wrapped so the ReadableStream polyfill runs before it (Safari).
import './stream-polyfill';
import 'pdfjs-dist/build/pdf.worker.min.mjs';
