// JSON Schema of figure specs, generated from the live catalogue so the enums never go stale.
// `frg schema` prints it; editors and AI assistants can validate specs against it.
import { DEFAULT_STYLE, emptyDocument } from '../model/defaults';
import { GROUP_LIBRARY } from '../model/library';
import { listLineStyles } from '../styles/lineStyles';
import { listVertexShapes, REGULATOR_KINDS } from '../styles/nodeKinds';
import { PRESET_ALIASES, RING, stampCatalog } from './spec';

export function specSchema(): object {
  const doc = emptyDocument();
  const fieldIds = [...new Set([...doc.fieldTypes, ...GROUP_LIBRARY.fields].map((f) => f.id))];
  const vertexIds = [...new Set([...doc.vertexTypes, ...GROUP_LIBRARY.vertexTypes].map((v) => v.id))];
  const stamps = stampCatalog();
  const slotNames = [...new Set(stamps.flatMap((s) => s.slots))];
  const fieldRef = { type: 'string', description: `Field (line type) id. Built in: ${fieldIds.join(', ')}; or one defined under "fields".`, examples: fieldIds };
  const slotMap = (desc: string, value: object) => ({
    type: 'object',
    description: `${desc} Keys are line slots of the diagram (${slotNames.join(', ')}; see "frg list") or line indices.`,
    additionalProperties: value,
  });
  const styleProps = Object.fromEntries(
    Object.entries(DEFAULT_STYLE).map(([k, v]) => [k, k === 'colorMode' ? { enum: ['color', 'grayscale', 'black'] } : { type: typeof v }]),
  );

  const regulatorKind = {
    enum: REGULATOR_KINDS,
    description: 'Regulator insertion: "regulator" = ∂ₜR (crossed circle), "flowRegulator" = (∂ₜ + 2δΦ̇/δΦ)R of the generalised flow equation with flowing fields (crossed pentagon).',
  };

  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'frg-spec.schema.json',
    title: 'fRG diagram figure spec',
    description: 'A figure as rows of TeX terms and pre-built Feynman diagrams. Build it with `frg build spec.json -o figure.tex`.',
    type: 'object',
    required: ['format', 'version', 'rows'],
    additionalProperties: false,
    properties: {
      $schema: { type: 'string' },
      format: { const: 'frg-spec' },
      version: { const: 1 },
      style: {
        description: 'Style preset name, or style-sheet overrides (optionally based on a preset).',
        oneOf: [
          { enum: Object.keys(PRESET_ALIASES) },
          { type: 'object', additionalProperties: false, properties: { preset: { enum: Object.keys(PRESET_ALIASES) }, ...styleProps } },
        ],
      },
      fields: {
        type: 'array',
        description: 'Extra line types, or overrides of built-in ones (same id).',
        items: {
          type: 'object',
          required: ['id', 'name', 'tex', 'line', 'color', 'arrows'],
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            tex: { type: 'string' },
            line: { enum: listLineStyles().map((l) => l.id) },
            color: { type: 'string', description: 'xcolor dvipsnames name (RoyalBlue, BrickRed, …) or #rrggbb.' },
            arrows: { enum: ['none', 'forward', 'opposite'] },
            params: { type: 'object', additionalProperties: { type: 'number' } },
          },
        },
      },
      vertexTypes: {
        type: 'array',
        description: 'Extra vertex types, or overrides of built-in ones (same id).',
        items: {
          type: 'object',
          required: ['id', 'name', 'shape', 'scale', 'fill', 'stroke', 'strokeWidth'],
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            shape: { enum: listVertexShapes().map((v) => v.id) },
            scale: { type: 'number' },
            fill: { type: 'string' },
            stroke: { type: 'string' },
            strokeWidth: { type: 'number' },
            tex: { type: 'string' },
          },
        },
      },
      regulatorKind: { ...regulatorKind, description: `Default regulator kind of every diagram. ${regulatorKind.description}` },
      rowGap: { type: 'number', description: 'Vertical gap between rows in pt (default 30).' },
      align: { enum: ['left', 'center'], description: 'Horizontal alignment of rows (default left).' },
      rows: {
        type: 'array',
        minItems: 1,
        description: 'Equation rows, top to bottom. Items in a row are laid out left to right on a common centre line.',
        items: {
          oneOf: [
            { type: 'array', items: { $ref: '#/$defs/item' } },
            { type: 'object', required: ['items'], additionalProperties: false, properties: { items: { type: 'array', items: { $ref: '#/$defs/item' } } } },
          ],
        },
      },
    },
    $defs: {
      item: {
        oneOf: [
          { type: 'string', description: 'TeX term (math mode), e.g. "+", "-\\frac{1}{2}", "\\partial_t\\Gamma^{(2)} =".' },
          {
            type: 'object',
            required: ['tex'],
            additionalProperties: false,
            properties: { tex: { type: 'string' }, size: { type: 'number' }, color: { type: 'string' } },
          },
          { $ref: '#/$defs/diagram' },
        ],
      },
      diagram: {
        type: 'object',
        required: ['diagram'],
        additionalProperties: false,
        properties: {
          diagram: {
            enum: [...stamps.map((s) => s.id), RING.id],
            description: [
              ...stamps.map((s) => `${s.id}: ${s.label}${s.slots.length ? ` [lines: ${s.slots.join(', ')}]` : ''}`),
              `${RING.id}: ${RING.label}, set by "vertices" [lines: 0, 1, …; line i runs from vertex i to i + 1]`,
            ].join('; '),
          },
          field: { ...fieldRef, description: 'Field of every line (default "scalar").' },
          legs: { ...fieldRef, description: 'Field of the external legs.' },
          internal: { ...fieldRef, description: 'Field of all internal lines.' },
          lines: slotMap('Field per internal line.', fieldRef),
          regulator: {
            description: 'Line(s) carrying the regulator insertion; "none", or "each" for the sum of copies with the regulator on each internal line.',
            oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
          },
          regulatorKind,
          vertex: { type: 'string', description: `Vertex type of the internal vertices: ${vertexIds.join(', ')}.`, examples: vertexIds },
          reverse: { type: 'array', items: { type: 'string' }, description: 'Line slots (or "legs") whose arrows are flipped.' },
          labels: slotMap('TeX label beside a line.', { type: 'string' }),
          momentum: slotMap('Momentum arrow with a TeX label beside a line.', { type: 'string' }),
          vertices: {
            type: 'array',
            minItems: 1,
            description:
              'External legs per internal vertex, in the diagram\'s vertex order: a leg count, or one entry per leg. Required for "ring"; on other diagrams the counts must match.',
            items: {
              oneOf: [
                { type: 'integer', minimum: 0 },
                {
                  type: 'array',
                  items: {
                    oneOf: [
                      fieldRef,
                      {
                        type: 'object',
                        required: ['field'],
                        additionalProperties: false,
                        properties: { field: fieldRef, dir: { enum: ['in', 'out'], description: 'Arrow into or out of the vertex.' } },
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    },
  };
}
