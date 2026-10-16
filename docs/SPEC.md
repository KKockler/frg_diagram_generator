# Figure specs and the `frg` command

A **figure spec** describes a figure as rows of TeX terms and pre-built diagrams, without any
coordinates. The `frg` command lays it out exactly like the editor's *Arrange row* and writes
TikZ, PDF, SVG, PNG or an editable `.frg.json`. Specs are easy to write by hand, generate from
scripts, or have an AI assistant write. **Open…** in the editor also accepts a spec, so you can
generate a figure and then touch it up with the mouse.

## Setup

Requires Node ≥ 20. PDF and PNG output also need `pdflatex` (and `pdftoppm` for PNG).
The CLI is a single file, deployed with the editor:

```bash
curl -O https://kkockler.github.io/frg_diagram_generator/frg.mjs
```

Then run `node frg.mjs …`. In a clone of this repository, `npm ci && npm run build:cli` builds it
as `dist-cli/frg.mjs`, and `npm link` installs a global `frg` command. The examples below write
`frg`. The JSON Schema is also online at `https://kkockler.github.io/frg_diagram_generator/frg-spec.schema.json`.

## Commands

```bash
frg build figure.json -o figure.tex -o figure.png   # outputs chosen by extension
frg build figure.json                                # tikzpicture on stdout
frg flow flow.json -o flow.png                       # full one-loop flow via FunKit (see below)
frg list                                             # diagrams, line slots, fields, vertex types
frg schema > frg-spec.schema.json                    # JSON Schema for editors / validators
```

`frg build` accepts a spec, an editor document (`.frg.json`), or a PDF/SVG/TeX file exported by the
editor or by `frg`. Output formats:

| Extension | Output |
|---|---|
| `.tex` | standalone LaTeX document (`pdflatex figure.tex`) |
| `.tikz` | bare `tikzpicture` to `\input` into a paper (needs `\usepackage{tikz}`) |
| `.frg.json` | editable document for the editor |
| `.svg` | SVG, labels typeset with MathJax |
| `.pdf` | PDF via `pdflatex` |
| `.png` | preview image via `pdflatex` + `pdftoppm` |

Every output embeds the document, so it can be re-opened in the editor. Options: `--scale s`
(1 model unit = s pt, default 1), `--margin pt` (SVG only, default 2). Invalid specs make `frg`
exit with status 1 and list every problem with its JSON path, e.g.

```
figure.json: invalid spec
  rows[0][1].field: unknown field "pi" (known: "pion", "sigma", "quark", …)
  rows[0][1].lines.top: no such line (this diagram has: "upper", "lower")
```

## Format

```json
{
  "$schema": "../frg-spec.schema.json",
  "format": "frg-spec",
  "version": 1,
  "style": "thesis",
  "rows": [
    [
      "\\partial_t\\Gamma^{(2)}_{\\pi} \\propto -\\frac{1}{2}",
      { "diagram": "tadpole", "field": "pion" },
      "+",
      { "diagram": "bubble", "field": "pion", "lines": { "upper": "sigma" } }
    ]
  ]
}
```

| Key | Meaning |
|---|---|
| `format`, `version` | always `"frg-spec"` and `1` |
| `rows` | list of rows, top to bottom. A row is a list of items (or `{"items": [...]}`) |
| `style` | optional. Preset `"fqcd"` (default; the look of arXiv:2408.08413: thin lines, grey vertices, lavender regulators), `"thesis"`, `"journal"` (black & white), `"grayscale"`, `"talk"`, or an object of style-sheet overrides such as `{"preset": "talk", "lineWidth": 2.5, "loopRadius": 30}`. Besides the sizes, `arrowOutline` (colour or `"none"`), `regulatorFill` (colour or `"none"`) and `regulatorStroke` (colour, or `"line"` for the line's colour) set how arrowheads and regulators are drawn |
| `fields`, `vertexTypes` | optional. Extra line/vertex types, or overrides of built-in ones with the same id (same shape as in `.frg.json`; see `frg schema`) |
| `regulatorKind` | optional. Regulator insertion of every diagram: `"regulator"` (∂ₜR, default) or `"flowRegulator"` ((∂ₜ + 2δΦ̇/δΦ)R); see the diagram option of the same name |
| `rowGap` | optional. Vertical gap between rows in pt (default 30) |
| `align` | optional. `"left"` (default) or `"center"` |

### Items

- **TeX term:** a string in math mode, such as `"+"`, `"-2"`, `"\\partial_t\\Gamma^{(2)} ="`.
  Remember to escape backslashes in JSON. For a different size or colour use
  `{"tex": "…", "size": 16, "color": "BrickRed"}`.
- **Diagram:** an object with `"diagram"` set to a pre-built diagram id, plus options:

| Option | Meaning |
|---|---|
| `field` | field of every line (default `"scalar"`) |
| `legs` | field of the external legs |
| `internal` | field of all internal lines |
| `lines` | field per internal line, by slot: `{"upper": "sigma", "lower": "pion"}` |
| `regulator` | slot carrying the regulator ⊗, a list of slots, `"none"`, or `"each"`: the sum of copies with ⊗ on each internal line in turn, joined by `+` |
| `regulatorKind` | `"regulator"` (default): ∂ₜR, a crossed circle; `"flowRegulator"`: (∂ₜ + 2δΦ̇/δΦ)R of the generalised flow equation with flowing fields, a crossed pentagon pointing along the line. Can also be set once at the top level of the spec for all diagrams |
| `vertex` | vertex type of the internal vertices (e.g. `"bareVertex"`, `"blob"`) |
| `reverse` | slots (or `"legs"`) whose arrows are flipped |
| `labels` | TeX label beside a line, by slot: `{"upper": "k"}` |
| `momentum` | momentum arrow with a TeX label beside a line, by slot |
| `vertices` | external legs per internal vertex, in the diagram's vertex order: a leg count, or a list with one entry per leg, either a field or `{"field": "quark", "dir": "in"}` (`dir` points the arrow into or `"out"` of the vertex). Defines a `ring`; on other diagrams the counts must match theirs |

Later options win: `field`, then `legs`/`internal`, then `lines` and `vertices`.

### Diagrams and their line slots

Internal lines are named by where they sit in the diagram. Lines can also be addressed by index
(`"0"`, `"1"`, …) in the order listed.

| Diagram | Line slots | Default ⊗ |
|---|---|---|
| `propagator` | line | — |
| `regulatorProp` | line | line |
| `wetterich` (closed loop of the Wetterich equation, no vertex) | loop | loop |
| `tadpole` | loop | loop |
| `bubble` (polarisation / self-energy) | upper, lower | upper |
| `fish` (4-point) | upper, lower | upper |
| `triangle` (3-point) | left, right, lower | left |
| `box` (4-point) | left, upper, right, lower | upper |
| `sunset` (2-loop) | upper, middle, lower | upper |
| `vertex4` (4-point vertex) | — | — |
| `npoint` (Γ⁽ⁿ⁾) | — | — |
| `exchange` (boson exchange) | middle | — |
| `ring` (any one-loop diagram, shaped by `vertices`) | 0, 1, …: line i runs from vertex i to i + 1 | 0 |

A **ring** has one vertex per entry of `vertices`, joined in a loop: one vertex is drawn as a
tadpole, two as a bubble, more as a regular polygon. `{"diagram": "ring", "vertices": [3, 1]}` is a
bubble with three legs on the left vertex and one on the right. Tadpole, bubble, fish, triangle and
box are rings too, with the same numbering of vertices and lines, so `vertices` works on them as
well (e.g. to give each leg its own field).

### Fields and vertex types

`frg list` prints the current tables. Built-in fields: `pion`, `sigma`, `quark`, `gluon`,
`ghost`, `photon`, `scalar`, and from the group library `vector`, `diquark`, `nucleon`. Vertex
types: `fullVertex` (default), `squareVertex`, `bareVertex`, `blob`, `hatched`, `counterterm`,
`gammaN`.

A custom field:

```json
"fields": [{ "id": "higgs", "name": "Higgs", "tex": "h", "line": "dashed", "color": "ForestGreen", "arrows": "none" }]
```

`line` is one of `single`, `double`, `dashed`, `dotted`, `wavy`, `curly`. `arrows` is `none`,
`forward` or `opposite`. `color` is an xcolor dvipsnames name (`RoyalBlue`, `BrickRed`,
`BurntOrange`, `ForestGreen`, `Purple`, `Gray`, …) or `#rrggbb`.

## Flow equations: `frg flow`

`frg flow` draws the complete one-loop flow of an n-point function. You give the theory's fields
and the external legs. FunKit's C++ engine takes n field derivatives of the Wetterich equation
∂ₜΓ = ½ STr G ∂ₜR, expands them over the fields and merges equal diagrams. Every term of the result
becomes a diagram with its prefactor. Tadpole, bubble, fish, triangle and box are used where they
fit, a `ring` otherwise.

```json
{
  "format": "frg-flow",
  "version": 1,
  "fields": [
    { "id": "sigma" },
    { "id": "pi", "line": "pion" },
    { "id": "q", "anti": "qb", "grassmann": true, "line": "quark" }
  ],
  "legs": ["pi", "pi"]
}
```

```bash
frg flow examples/qm_pion.flow.json -o pion.png -o pion.tex -o pion.spec.json --funkit path/to/funkit
```

| Key | Meaning |
|---|---|
| `fields` | the fields. `id` is the name FunKit uses; `anti` names the antifield of a complex field; `grassmann` marks fermions (they need `anti`); `line` is the line type it is drawn with (default: the id, see `frg list`); `tex` / `antiTex` its TeX in Γ's subscript (default: the line type's TeX and `\bar{…}`) |
| `legs` | external legs, by field or antifield name: `["qb", "q", "pi"]` is Γ⁽³⁾ of q̄qπ |
| `vertices` | optional. Allowed vertices, e.g. `[["sigma", "pi", "pi"], ["qb", "q", "pi"]]`. The default is the **maximal truncation**: every vertex with 3 to n + 2 legs (all a one-loop n-point flow can contain) that has as many fields as antifields of each complex field |
| `lhs` | optional. Left-hand side, TeX. Default `\partial_t\Gamma^{(n)}_{…} =` |
| `perRow` | optional. Diagrams per row (default 4) |
| `regulator` | optional. `"insertion"` (default): one term per regulator position, with ⊗ on the line. `"tilde"`: the diagrams without regulator inside \tilde{\partial}_t [ … ], where \tilde{\partial}_t acts only on the regulator dependence. The copies of a diagram D with ⊗ on each of its n lines then become one term: they sum to −\tilde{\partial}_t D, so FunKit's coefficients c_j turn into −Σc_j / n |
| `style`, `lineTypes`, `vertexTypes`, `regulatorKind`, `vertex`, `rowGap`, `align` | passed on to the figure spec (`lineTypes` becomes its `fields`) |

How the figure is drawn:

- Propagators and regulators are diagonal in field space: no mixed propagators.
- Coefficients are FunKit's, including the factor −1 of each fermion loop and one term per
  regulator position. Terms are not combined further, except with `"regulator": "tilde"`.
- The terms are ordered by the number of vertices. The copies of a diagram with the regulator on
  different lines stand together.
- The external legs sit in the same place in every diagram, in the order of `legs`. Arrows of
  complex fields follow the charge: a field leg (`q`) points into its vertex, an antifield leg
  (`qb`) out of it.
- Outputs are as for `build`, plus `.spec.json` for the generated figure spec. Without `-o` the spec
  goes to stdout. Edit the spec to touch up the figure, then rebuild it with `frg build`.

FunKit runs as **WebAssembly** by default: `funkit.mjs` and `funkit.wasm`, compiled from the
FunKit commit pinned in [`funkit.json`](../funkit.json). The site serves them next to `frg.mjs`,
so download all three into one directory:

```bash
for f in frg.mjs funkit.mjs funkit.wasm; do curl -O https://kkockler.github.io/frg_diagram_generator/$f; done
```

In a clone, `scripts/build-funkit-wasm.sh` builds them into `dist-wasm/`, using Docker if Emscripten
is not installed. The WebAssembly build runs on a single thread and in at most 4 GB of memory. For
very large flows (6 or more legs), build FunKit natively (in its `cpplib` directory:
`mkdir build && cd build && cmake .. && make funkit`) and pass the binary with `--funkit <path>` or
set `FUNKIT`. `--save-funkit result.json` keeps FunKit's raw result.

The editor has the same feature: **Flow…** in the toolbar runs FunKit in the browser and adds the
equation below your drawing.

## Examples

[`examples/`](../examples) has specs for the figures in the user guide:

- [`2pt_flow.spec.json`](../examples/2pt_flow.spec.json) — the two-point flows
- [`notation.spec.json`](../examples/notation.spec.json) — the notation table
- [`showcase.spec.json`](../examples/showcase.spec.json) — regulator sums, slot overrides, labels, momentum arrows
- [`qm_pion.flow.json`](../examples/qm_pion.flow.json), [`qm_yukawa.flow.json`](../examples/qm_yukawa.flow.json),
  [`phi4_4pt.flow.json`](../examples/phi4_4pt.flow.json) — flows for `frg flow`: the pion 2-point function of the
  quark-meson model, its q̄qπ vertex, and the 4-point function of a scalar

## Limits

Specs cover figures built from the pre-built diagrams and rings in equation rows. For anything else
(custom topologies, shaded regions, free-hand placement), build the spec, open the `.frg.json`
in the editor and finish it there.
