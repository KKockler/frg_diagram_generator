import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { funkitInput, validateFlow } from './flow';
import { runFunkitWasm, WASM_OUT, type FunkitFactory } from './wasm';

// Needs the WebAssembly build (scripts/build-funkit-wasm.sh); CI builds it in the funkit-wasm job.
const WASM = join(__dirname, '../../dist-wasm/funkit.mjs');
const read = (path: string) => JSON.parse(readFileSync(join(__dirname, path), 'utf8'));

describe.skipIf(!existsSync(WASM))('FunKit as WebAssembly', () => {
  for (const name of ['qm_pion', 'phi4_4pt', 'qm_yukawa'])
    it(`reproduces the native result of ${name}`, async () => {
      const { default: create } = (await import(/* @vite-ignore */ pathToFileURL(WASM).href)) as { default: FunkitFactory };
      const out = await runFunkitWasm(create, funkitInput(validateFlow(read(`../../examples/${name}.flow.json`)), WASM_OUT));
      expect(out.equation).toEqual(read(`fixtures/${name}.funkit.json`).equation);
    });
});
