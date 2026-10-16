import { defineConfig } from 'vite';

// Bundles the command-line tool into one self-contained Node script: dist-cli/frg.mjs.
export default defineConfig({
  define: { PACKAGE_VERSION: JSON.stringify('3.2.1') },
  ssr: { noExternal: true },
  build: {
    ssr: 'src/cli/main.ts',
    outDir: 'dist-cli',
    emptyOutDir: true,
    target: 'node20',
    rolldownOptions: {
      output: { entryFileNames: 'frg.mjs', banner: '#!/usr/bin/env node' },
    },
  },
});
