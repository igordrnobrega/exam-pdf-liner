import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { target: 'es2022' },
  server: {
    // Real patient reports live in pdfs/ during development; never serve them.
    fs: { deny: ['pdfs/**', '**/*.pdf'] },
  },
});
