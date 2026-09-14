// pdf.js worker wrapped so the ReadableStream polyfill runs before it (Safari).
// Bumped once so browsers that cached a 404 for the previous bundle name fetch a fresh file.
import './stream-polyfill';
import 'pdfjs-dist/build/pdf.worker.min.mjs';
