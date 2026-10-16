import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the build works under any sub-path (e.g. GitHub Pages).
export default defineConfig({
  base: './',
  plugins: [react()],
  // FunKit's WebAssembly build (scripts/build-funkit-wasm.sh), served next to index.html.
  publicDir: 'dist-wasm',
  worker: { format: 'es' },
  // MathJax's version.js otherwise falls back to eval('require'), which breaks in the browser.
  define: { PACKAGE_VERSION: JSON.stringify('3.2.1') },
  build: { chunkSizeWarningLimit: 3000 },
  test: { environment: 'node' },
});
