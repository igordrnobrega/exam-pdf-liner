// pdf.js worker wrapped so the ReadableStream polyfill runs before it (Safari).
import './stream-polyfill';
import 'pdfjs-dist/build/pdf.worker.min.mjs';

// Survives minification, so bumping it changes the bundle hash: browsers that
// cached a 404 for a previous worker file name fetch a fresh one.
(globalThis as { EXAM_LINER_WORKER?: string }).EXAM_LINER_WORKER = '2';
