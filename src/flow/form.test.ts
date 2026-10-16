import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { emptyDocument } from '../model/defaults';
import { flowToSpec, validateFlow, type FlowSpec } from './flow';
import { defaultChoice, fieldNames, flowToForm, formToFlow } from './form';

const types = emptyDocument().fieldTypes;
const example = (name: string): FlowSpec => validateFlow(JSON.parse(readFileSync(join(__dirname, `../../examples/${name}.flow.json`), 'utf8')));

describe('Flow… form', () => {
  it('turns checked line types into fields', () => {
    const flow = validateFlow(
      formToFlow({ fields: { sigma: defaultChoice('sigma'), pion: defaultChoice('pion'), quark: defaultChoice('quark') }, legs: [{ line: 'quark', anti: true }, { line: 'quark', anti: false }, { line: 'pion', anti: false }], vertices: '', perRow: 4 }, types),
    );
    expect(flow.fields).toEqual([
      { id: 'pion', line: 'pion' },
      { id: 'sigma', line: 'sigma' },
      { id: 'quark', line: 'quark', anti: 'quarkbar', grassmann: true },
    ]);
    expect(flow.legs).toEqual(['quarkbar', 'quark', 'pion']);
    expect(flow.vertices).toBeUndefined();
  });

  it('loads the examples, with their vertices in the form names', () => {
    const form = flowToForm(example('qm_yukawa'));
    expect(form.fields).toEqual({ sigma: { complex: false, grassmann: false }, pion: { complex: false, grassmann: false }, quark: { complex: true, grassmann: true } });
    expect(form.legs).toEqual([{ line: 'quark', anti: true }, { line: 'quark', anti: false }, { line: 'pion', anti: false }]);
    expect(form.vertices.split('\n')).toEqual(['sigma pion pion', 'quarkbar quark pion', 'quarkbar quark sigma']);
    // Round trip: the same FunKit setup up to names, so the same figure.
    const flow = validateFlow(formToFlow(form, types));
    const out = JSON.parse(readFileSync(join(__dirname, 'fixtures/qm_yukawa.funkit.json'), 'utf8'));
    const rename = (x: unknown) => JSON.parse(JSON.stringify(x).replace(/"qb"/g, '"quarkbar"').replace(/"q"/g, '"quark"').replace(/"pi"/g, '"pion"'));
    expect(flowToSpec(flow, rename(out)).rows).toEqual(flowToSpec(example('qm_yukawa'), out).rows);
  });

  it('makes names FunKit accepts', () => {
    expect([...fieldNames(['my-field', '2x', 'myfield']).values()]).toEqual(['myfield', 'f2x', 'myfield2']);
  });
});
