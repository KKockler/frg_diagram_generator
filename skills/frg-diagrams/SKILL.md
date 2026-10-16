---
name: frg-diagrams
description: Draw functional renormalisation group (fRG) / Feynman diagram figures and whole one-loop flow equations (Wetterich equation) as TikZ/LaTeX, PDF, PNG or SVG with the frg diagram generator. Use when the user asks for the flow of an n-point function or vertex (e.g. "the flow of the three-gluon vertex with gluons and ghosts", "pion two-point flow in the quark-meson model"), or for a figure of tadpole/bubble/triangle/box diagrams, propagators and regulator insertions.
---

# fRG diagrams with `frg`

`frg` is a single-file Node CLI (Node ≥ 20) hosted next to the browser editor. You need no clone
and no build. It runs FunKit (arXiv:2605.28935), which derives flow equations, as WebAssembly.

## 1. Get the tool (cached, ~4 MB)

```bash
FRG=${FRG_HOME:-$HOME/.cache/frg}; mkdir -p "$FRG"
for f in frg.mjs funkit.mjs funkit.wasm; do
  curl -sSf -z "$FRG/$f" -o "$FRG/$f" https://kkockler.github.io/frg_diagram_generator/$f
done
node "$FRG/frg.mjs" help
```

`-z` only re-downloads files that changed on the server. Keep the three files in one directory:
`frg.mjs` finds `funkit.mjs`/`funkit.wasm` next to itself. PNG/PDF output needs `pdflatex` and
`pdftoppm`. Without them, write `.svg`, `.tex` and `.frg.json` and tell the user to compile the `.tex`.

## 2a. Whole flow equations → `frg flow`

For "the flow of Γ⁽ⁿ⁾ / of vertex X in theory Y", write a **flow file**. Never write the diagrams
or prefactors yourself: FunKit computes the terms, signs and symmetry factors.

```json
{
  "format": "frg-flow",
  "version": 1,
  "fields": [
    { "id": "A", "line": "gluon" },
    { "id": "c", "anti": "cb", "grassmann": true, "line": "ghost" }
  ],
  "vertices": [["A", "A", "A"], ["A", "A", "A", "A"], ["cb", "c", "A"]],
  "legs": ["A", "A", "A"]
}
```

```bash
node "$FRG/frg.mjs" flow ym3.flow.json -o ym3.png -o ym3.tex -o ym3.spec.json -o ym3.frg.json
```

| Key | Meaning |
|---|---|
| `fields` | `id`: name used in `legs`/`vertices`. `anti`: antifield of a complex field. `grassmann: true`: fermion/ghost (needs `anti`). `line`: line type to draw (`frg list`; default the id). `tex`/`antiTex`: TeX in Γ's subscript |
| `legs` | external legs by field/antifield name: `["qb", "q", "pi"]` is Γ⁽³⁾ of q̄qπ |
| `vertices` | optional allowed vertices. **Default: maximal truncation**, i.e. every vertex with 3 to n+2 legs that conserves each complex field's charge |
| `lhs` | optional TeX left-hand side (default `\partial_t\Gamma^{(n)}_{…} =`) |
| `perRow` | diagrams per row (default 4) |
| `regulator` | `"insertion"` (default; ⊗ on each line in turn) or `"tilde"` (no ⊗, terms inside \tilde\partial_t[…]). Newer versions only. If it is rejected as an unknown key, leave it out and say so |
| `style` | `"fqcd"` (default), `"thesis"`, `"journal"` (b/w), `"grayscale"`, `"talk"` |

**Truncation is a physics choice, so make it explicit.** The maximal truncation includes vertices
that vanish classically (for Yang–Mills: ghost tadpoles, AAc̄c, five- and six-gluon vertices). If the
user says "only gluons and ghosts" without naming vertices, use the classical vertex structure of
the theory, as in the example above, and say which vertices you allowed. Offer the maximal
truncation as the alternative. Other common cases:

- Quark-meson model: fields `sigma`, `pi` (line `pion`), `q`/`qb` grassmann (line `quark`).
- QED: `{ "id": "a", "line": "photon" }`, `{ "id": "psi", "anti": "psib", "grassmann": true, "line": "quark" }`.
- O(N)/φ⁴: `{ "id": "phi", "line": "scalar" }`.

The WebAssembly build is single-threaded and limited to 4 GB of memory. Flows with 6 or more legs in
big truncations may be slow or fail. Then suggest a native FunKit build (`--funkit <path>`).

## 2b. Hand-made figures → `frg build` with a figure spec

For figures that are not a full flow (a few chosen diagrams, notation tables), write a spec:

```json
{
  "format": "frg-spec",
  "version": 1,
  "rows": [
    ["\\partial_t\\Gamma^{(2)}_{\\pi} = -\\frac{1}{2}",
     { "diagram": "tadpole", "field": "pion" }, "+",
     { "diagram": "bubble", "field": "pion", "lines": { "upper": "sigma" }, "regulator": "each" }]
  ]
}
```

```bash
node "$FRG/frg.mjs" build figure.json -o figure.png -o figure.tex -o figure.frg.json
```

- Strings are TeX terms in math mode. Escape backslashes (`"\\frac12"`). Prefactors and signs are
  their own terms (`"-2"`, `"+"`).
- Diagrams: `propagator`, `regulatorProp`, `wetterich`, `tadpole`, `bubble`, `fish`, `triangle`,
  `box`, `sunset`, `vertex4`, `npoint`, `exchange`, and `ring` (any one-loop topology, e.g.
  `{"diagram": "ring", "vertices": [3, 1]}`).
- Options: `field`, `legs`, `internal`, `lines` (field per slot), `regulator` (slot, list, `"none"`,
  `"each"` = sum over regulator positions), `vertex`, `reverse`, `labels`, `momentum`, `vertices`.
- Fields: `pion`, `sigma`, `quark`, `gluon`, `ghost`, `photon`, `scalar`, `vector`, `diquark`,
  `nucleon`. Define new ones under top-level `"fields"`.
- `node "$FRG/frg.mjs" list` prints every diagram's line slots, fields and vertex types, and
  `node "$FRG/frg.mjs" schema` prints the JSON Schema. The full reference is
  https://kkockler.github.io/frg_diagram_generator/SPEC.md

Errors list each problem with its JSON path. Fix them and rerun.

## 3. Check and hand over

1. Look at the PNG yourself. Check the legs, field types and that the truncation is the one the
   user asked for.
2. Give the user:
   - the image (show it, or send the PNG)
   - `.tex` (standalone; `pdflatex` it) or `.tikz` (bare tikzpicture to `\input`) for the paper
   - `.frg.json` for hand edits in the browser editor
     (https://kkockler.github.io/frg_diagram_generator/, **Open…**)
   - for flows, the generated `.spec.json`, which can be tweaked and rebuilt with `frg build`
3. Say which truncation (vertex set) you used. For flows, say that FunKit computed the prefactors.
