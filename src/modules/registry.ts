export type ModuleGroup =
  | 'Fundamentals'
  | 'Stackup & Impedance'
  | 'Power Integrity'
  | 'SI & EMC';

export interface ModuleInfo {
  id: string;
  title: string;
  group: ModuleGroup;
  status: 'ready' | 'soon';
  /** One-paragraph description; shown as subtitle and as the stub body. */
  description: string;
}

export const MODULE_GROUPS: ModuleGroup[] = [
  'Fundamentals',
  'Stackup & Impedance',
  'Power Integrity',
  'SI & EMC',
];

export const MODULES: ModuleInfo[] = [
  {
    id: 'return-current',
    title: 'Where does return current flow?',
    group: 'Fundamentals',
    status: 'ready',
    description:
      'Every signal current returns to its source — but where? Watch the return current ' +
      'in the plane spread out at DC and crowd under the trace at high frequency, and see ' +
      'why cutting a slot under a trace is one of the worst things you can do to a board.',
  },
  {
    id: 'trace-fields',
    title: 'Fields around a trace',
    group: 'Fundamentals',
    status: 'soon',
    description:
      'A 2D electrostatic solver computes the actual E-field around a microstrip or ' +
      'stripline cross-section. Drag the geometry — trace width, dielectric height, εr — ' +
      'and watch the field lines, the energy distribution, and the characteristic ' +
      'impedance Z0 respond in real time. Makes it visceral that impedance is geometry.',
  },
  {
    id: 'stackup-explorer',
    title: 'Stackup explorer',
    group: 'Stackup & Impedance',
    status: 'soon',
    description:
      'Build 2-, 4-, and 6-layer stackups and compare them. See how field containment ' +
      'changes when signals reference a solid plane versus another signal layer, why ' +
      'plane pairs make good stackups, and what the classic good and bad stackup ' +
      'orderings actually do to the fields.',
  },
  {
    id: 'decoupling',
    title: 'Decoupling capacitors',
    group: 'Power Integrity',
    status: 'soon',
    description:
      'A real capacitor is an RLC series circuit. Plot |Z| versus frequency for one ' +
      'capacitor, then add more in parallel — including mixed values — and discover ' +
      'self-resonance, the effect of ESR and ESL, and the anti-resonance peaks that ' +
      'appear when different capacitors interact.',
  },
  {
    id: 'loop-inductance',
    title: 'Loop inductance',
    group: 'Power Integrity',
    status: 'soon',
    description:
      'Inductance belongs to loops, not wires. Stretch and shrink a current loop and see ' +
      'its inductance and the impedance it presents at high frequency. Explains why loop ' +
      'area is the number-one quantity to minimize in high-speed layout and decoupling.',
  },
  {
    id: 'crosstalk',
    title: 'Crosstalk',
    group: 'SI & EMC',
    status: 'soon',
    description:
      'An aggressor trace couples capacitively and inductively into a victim. Vary the ' +
      'spacing between traces and their height above the plane, and watch near-end and ' +
      'far-end crosstalk respond — revealing the layout rules (3W, tight coupling to the ' +
      'plane) that actually control coupling.',
  },
  {
    id: 'wave-playground',
    title: 'Wave playground',
    group: 'SI & EMC',
    status: 'soon',
    description:
      'A 2D FDTD sandbox: launch waves and watch them propagate, reflect, and diffract. ' +
      'Place walls, slots, shields, and via fences, and see with your own eyes what ' +
      'shielding and stitching actually do to a propagating field.',
  },
  {
    id: 'grounding-sins',
    title: 'Grounding sins',
    group: 'SI & EMC',
    status: 'soon',
    description:
      'The classic layout mistakes, animated: a trace crossing a slot in its return ' +
      'plane, and split analog/digital planes done wrong. See the return current detour, ' +
      'the loop area balloon, and the coupling it creates — and how to fix each one.',
  },
];
