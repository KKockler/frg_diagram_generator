# fRG Diagram Editor

A browser app for drawing the diagrams in fRG papers (flow equations, notation tables,
bosonisation pictures, …) with the mouse, no LaTeX code required. The main output is a vector
**PDF** for `\includegraphics`. **TikZ** (standalone `.tex`, or *Copy TikZ* to paste a
`tikzpicture` into a paper, with labels typeset by LaTeX) and **SVG** are also available. Every
export embeds its source, so **Open…** on an exported PDF/SVG/TeX file makes it editable again.

![Example: two-point flows built with the editor](docs/2pt_flow.png)

Start with the [user guide](docs/GUIDE.md), which builds the figure above step by step. The editor
runs at <https://kkockler.github.io/frg_diagram_generator/>.

## How this was made

This tool was developed with [Claude Code](https://claude.com/claude-code), Anthropic's AI coding
assistant, which wrote most of the code and documentation. Konrad Kockler specified the
requirements and fRG conventions, reviewed and tested the output, and maintains the project.

## Credits

The flow equations of `frg flow` are derived by [FunKit](https://github.com/satfra/FunKit), a
computer algebra toolkit for functional approaches by **Franz R. Sattler** (Universität Bielefeld),
used with his permission. Its C++ engine takes the functional derivatives of the Wetterich equation,
expands them over the fields and finds the distinct diagrams with their prefactors; this tool only
draws the result. If you use the generated flow equations in your work, please cite FunKit:

> F. R. Sattler, *FunKit: A computer algebra toolkit for functional approaches*,
> [arXiv:2605.28935](https://arxiv.org/abs/2605.28935) (2026).

FunKit is licensed under the GPL-3.0-or-later.

## From the command line (and for AI assistants)

Figures can also be described as a **figure spec**: rows of TeX terms and pre-built diagrams in
JSON, with no coordinates. The `frg` command turns a spec into TikZ, PDF, SVG, PNG or an editable
`.frg.json`:

```bash
curl -O https://kkockler.github.io/frg_diagram_generator/frg.mjs
node frg.mjs build figure.json -o figure.pdf -o figure.frg.json
```

`frg.mjs` is a single file that only needs Node ≥ 20, and the site serves the latest build. In a
clone, `npm ci && npm run build:cli` builds it as `dist-cli/frg.mjs`.

This makes the tool easy to script and easy for AI assistants to use: they write the spec, build a
PNG preview and iterate. **Open…** in the editor also accepts specs. See [docs/SPEC.md](docs/SPEC.md)
for the format and [AGENTS.md](AGENTS.md) for the AI workflow.

`frg flow`, and **Flow…** in the editor, draw the full one-loop flow of an n-point function from
just the fields and the external legs, with all diagrams and prefactors. The terms come from the
C++ engine of [FunKit](https://github.com/satfra/FunKit)
([arXiv:2605.28935](https://arxiv.org/abs/2605.28935)), compiled to WebAssembly, so nothing needs
installing (see [docs/SPEC.md](docs/SPEC.md#flow-equations-frg-flow)).

### Claude skill

[`skills/frg-diagrams`](skills/frg-diagrams/SKILL.md) teaches Claude the whole workflow on any
machine with Node. It downloads the CLI on first use, so the repository is not needed. You can then
ask Claude for, e.g., "the flow of the three-gluon vertex with only gluons and ghosts". For Claude
Code:

```bash
mkdir -p ~/.claude/skills/frg-diagrams && curl -o ~/.claude/skills/frg-diagrams/SKILL.md https://kkockler.github.io/frg_diagram_generator/SKILL.md
```

For claude.ai, upload [`frg-diagrams.zip`](https://kkockler.github.io/frg_diagram_generator/frg-diagrams.zip)
under Settings → Capabilities → Skills. The sandbox there must be allowed to reach this site.

## Using it

| Tool | Key | What it does |
|---|---|---|
| Select | `V` | Click/drag to select and move. Drag the ◇ handle on a selected line to bend it (snaps to straight and to a semicircle) or to resize and rotate a self-loop. Shift = multi-select, rubber-band on empty space. |
| Line | `L` | Drag from a vertex or empty space to draw a propagator of the active field. Click a vertex to add a self-loop. |
| Vertex | `P` | Click empty space to place a vertex, click a line to split it with a vertex, click a node to change its kind. |
| Insert | `R` | Click a line to put a regulator insertion on it: ∂ₜR ⊗, the flowing-field regulator (∂ₜ + 2δΦ̇/δΦ)R ⬠, a dressing blob or a cross. In Select mode, drag insertions along the line or onto another line. |
| Text | `T` | Click a line or vertex to label it (the label moves with it; it defaults to the field's symbol). Click empty space for a free TeX term such as `+`, `-\frac12` or `\partial_t\Gamma^{(2)}_\pi \propto`. |
| Box | `B` | Drag to draw a shaded box or ellipse behind the diagram (fill, opacity, outline and corner radius in the inspector). |
| Diagram | `D` | Click to place a pre-built diagram: propagator, regulator insertion, Wetterich loop, tadpole, polarisation, fish, triangle, box, sunset, 4-point vertex, n-point vertex Γ⁽ⁿ⁾, boson exchange. The tool then switches back to Select with the new diagram selected. |

- **Pre-built diagrams are groups:** one click selects the whole diagram and it moves as a unit,
  so the geometry stays canonical. Swap parts with the drawing tools:
  - pick a field and click a line with the **Line** tool;
  - pick a vertex kind and click a vertex with the **Vertex** tool;
  - drag a ⊗ onto another line.

  Double-click selects a single element, and **Ungroup** (in the inspector) frees the geometry.
  `Ctrl+G` groups your own drawings.
- **Re-assigning in bulk:** in Select mode, select lines (or a whole diagram) and click a field
  in the palette to re-assign all of them. The same works for vertex and insertion kinds. With a
  drawing tool active, palette clicks only choose what to draw next.
- **Equation rows:** select diagrams and TeX terms and press `A` (**Arrange row**). They are lined
  up left to right with even gaps on a common centre line.
- **⊗ on each line → sum:** with a diagram selected, this makes copies with the regulator on
  each internal line in turn, joined by `+`, and pushes whatever stands to the right out of the way.
- **Arrange panel** (in the inspector, for a multi-selection or group): align, distribute,
  rotate by 15°/90° (`[` `]`, Shift for 90°) and mirror.
- **Momentum arrows:** select a single line (double-click inside a group) and tick *Momentum arrow*
  in the inspector.
- **Labels:** typeset with MathJax, so they use the TeX fonts and end up in the PDF as vector
  paths.
- **Connecting:** drop a line's loose endpoint onto a vertex to attach it.
- **Other keys:** `F` reverses arrow direction, `Ctrl+D` duplicates (handy for building sums),
  arrow keys nudge, `Alt` disables snapping, the wheel zooms, and `Space`- or middle-drag pans.
- **Style sheet:** with nothing selected, the right panel shows the style sheet: line width,
  double-line spacing, vertex/⊗ radii, loop radius, etc. It applies to the whole document, so all diagrams stay consistent.
- **Lines & vertices…** edits the document's types. Every line or vertex of an edited type
  updates immediately.
  - *Lines* tab (field types): name, TeX symbol, line style, arrows, colour (named or any custom
    colour), and style parameters such as coil amplitude or dash length.
  - *Vertices* tab (vertex types): shape (circle, square, diamond, triangle, hatched circle,
    cross), size relative to the style sheet's vertex radius, fill (the style sheet colour, none,
    or any colour), outline colour and width, and optional TeX inside (e.g. `n` for a Γ⁽ⁿ⁾ blob).
- **Style presets:** fQCD (the default, the look of
  [arXiv:2408.08413](https://arxiv.org/abs/2408.08413)), Thesis, Journal (black & white), Grayscale
  and Talk (bold) restyle the whole document in one go. The colour mode can also be set on its own.
- **Library…** shows the bundled group library (`library/group.frglib.json`) and your personal
  library.
  - *Save as template* (select a diagram first) adds your own diagrams to the palette.
  - *Export my library* / *Import library…* share templates and field types as `.frglib.json`.
  - See [library/README.md](library/README.md) for adding to the group library.
- **Flow…** draws the whole one-loop flow of an n-point function. Tick the fields, pick the
  external legs, and FunKit (in the browser) supplies the diagrams and prefactors, either with
  regulator insertions or in the \tilde\partial_t notation. The result is added below your drawing.
  **About…** shows the credits and references.
- **Saving:** **Save** writes a `.frg.json`. The browser also autosaves locally, but files are the real source.

Default conventions:

| Field | Line | Colour |
|---|---|---|
| π | double line with opposite arrows | light blue `#00a6fb` |
| σ | double line with opposite arrows | BrickRed |
| q | single line with arrow | black |
| gluon | curly | orange-red `#ff4000` |
| ghost | dashed with arrow | black |
| photon | wavy | black |
| scalar | solid line, no arrow | black |

The meson, gluon and ghost lines follow [arXiv:2408.08413](https://arxiv.org/abs/2408.08413).
Named colours use the xcolor `dvipsnames` values. In the default fQCD style, vertices are grey
(`#b3b3b3`) and regulators lavender. In the other presets, vertices are midnight blue (`#191970`,
the svgnames value; the dvipsnames colour of the same name is actually teal). Change any of
these in **Lines & vertices…**, or in a spec or flow file under `fields` / `lineTypes`.

## Development

Requires Node ≥ 20.

```bash
npm install
```

```bash
npm run dev        # dev server on http://localhost:5173
```

```bash
npm test           # unit tests (geometry, document ops, file round-trip)
```

```bash
npm run build      # static site in dist/
```

```bash
scripts/build-funkit-wasm.sh   # FunKit as WebAssembly in dist-wasm/, for Flow… and frg flow
```

On a machine where the file watcher fails (`EMFILE`, too few inotify instances), use
`npm run build && npm run preview` instead of `npm run dev`.

To compile every template's TikZ export locally (this is what CI does), run these two commands:

```bash
TIKZ_OUT=build/tikz npx vitest run src/export/tikz.test.ts
```

```bash
cd build/tikz && for f in *.tex; do pdflatex -halt-on-error "$f" >/dev/null && echo "ok $f"; done
```

CI (`.github/workflows/ci.yml`) runs the following on every push:
- type-check and unit tests;
- compiles the TikZ export of every pre-built diagram with pdflatex;
- builds FunKit as WebAssembly, checks it against the native results and draws the example flows;
- publishes `main` to GitHub Pages.

### Code layout

```
src/model/      document types, defaults (fields, colours, style sheet), editing ops, stamps, row layout
src/geometry/   lines and circular arcs parametrised by arc length (exact offsets for double lines)
src/styles/     registries: line styles, node kinds, insertion kinds
src/render/     document → renderer-independent primitives → SVG; TeX via MathJax
src/export/     PDF (jsPDF + svg2pdf.js), SVG, TikZ, file I/O with embedded source
src/flow/       flow equations: FunKit input, its result as a figure spec, WebAssembly runner
src/spec/       figure specs and their JSON Schema
src/cli/        the frg command
library/        bundled group library (field types, templates)
skills/         Claude skill for the frg workflow (also served as llms.txt)
src/store/      zustand store with undo/redo and autosave
src/ui/         React components (canvas, palette, inspector, toolbar)
```

A single geometry engine turns every line into Bézier paths. The screen, SVG and PDF all
render these same primitives, so the preview is exactly what ends up in the paper.

### Extending

- **New field** (e.g. a vector meson): no code needed. Use **Lines & vertices…**, or share it via the group
  library. To make it a built-in default, add it to `DEFAULT_FIELDS` in `src/model/defaults.ts`.
- **New line style:** call `registerLineStyle({ id, label, params, build })` in
  `src/styles/lineStyles.ts`. `build` receives the centre-line `Path` and returns primitives.
- **New vertex type:** no code needed. Use **Lines & vertices… → Vertices**. For a new *shape*,
  call `registerVertexShape` in `src/styles/nodeKinds.ts`; for a new insertion kind, call
  `registerInsertionKind` in the same file.
- **New pre-built diagram:** add a `Stamp` to `src/model/stamps.ts`, using the `Builder` helpers.
