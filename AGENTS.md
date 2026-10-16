# Notes for AI assistants

This repository is a browser editor for fRG / Feynman diagram figures, plus the `frg` command
that builds figures from a JSON **figure spec** without the browser. If someone asks you for
a figure, write a spec and build it. Don't drive the GUI, and don't write `.frg.json` documents
by hand (they use absolute coordinates).

## Workflow

1. Get the CLI, a single file that needs Node ≥ 20: `curl -O https://kkockler.github.io/frg_diagram_generator/frg.mjs`. In a clone,
   `npm ci && npm run build:cli` builds it as `dist-cli/frg.mjs` instead. PDF/PNG output also needs
   `pdflatex` and `pdftoppm`. The commands below write `frg.mjs` for whichever copy you use.
2. Run `node frg.mjs list` for the diagram ids, their line slots, fields and vertex
   types. `docs/SPEC.md` is the full reference, and `examples/*.spec.json` are worked examples.
3. Write the spec, e.g. `figure.json`:

   ```json
   {
     "format": "frg-spec",
     "version": 1,
     "rows": [
       ["\\partial_t\\Gamma^{(2)}_{\\pi} \\propto -\\frac{1}{2}",
        { "diagram": "tadpole", "field": "pion" }, "+",
        { "diagram": "bubble", "field": "pion", "lines": { "upper": "sigma" } }]
     ]
   }
   ```

4. Build it and look at the result:
   `node frg.mjs build figure.json -o figure.png -o figure.tex -o figure.frg.json`.
   Errors list each problem with its JSON path. Fix them and rebuild.
5. Give the user the `.tex`/`.pdf` for their paper and the `.frg.json` for hand edits in the
   editor (`npm run dev`, then **Open…**).

## Whole flow equations

For "the flow of Γ⁽ⁿ⁾ in theory X", don't write the diagrams yourself. Write a flow file
(fields and external legs, see `examples/*.flow.json` and "Flow equations" in `docs/SPEC.md`) and run
`node frg.mjs flow flow.json -o flow.png -o flow.spec.json`. It runs FunKit as WebAssembly from
`funkit.mjs` + `funkit.wasm` next to `frg.mjs` (download them from the same site; in a clone,
`scripts/build-funkit-wasm.sh`), or a native binary given with `--funkit <path>`. FunKit computes
the terms and prefactors; never guess them.

## Tips

- Escape TeX backslashes in JSON (`"\\frac{1}{2}"`). Terms are in math mode already.
- `"regulator": "each"` writes the sum over regulator positions for you.
- Prefactors and signs are ordinary TeX terms between diagrams (`"-2"`, `"+"`, `"-\\frac12"`).
- Unknown field? Define it under `"fields"` (see `docs/SPEC.md`).

## Working on the code

`npm test` runs the tests and `npm run typecheck` the type check. The spec format lives in
`src/spec/`, and the CLI in `src/cli/main.ts`. After changing the stamps or the spec format,
refresh `frg-spec.schema.json` with `npm run build:cli && node dist-cli/frg.mjs schema > frg-spec.schema.json`
(a test checks it).
