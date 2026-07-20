/**
 * Render smoke test: server-renders the component tree (no DOM, no effects —
 * canvases and the solver worker stay inert) to catch runtime errors in
 * render bodies, including KaTeX equation rendering.
 */
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { App } from './App';
import { TraceFieldsModule } from './modules/trace-fields/TraceFieldsModule';
import { StackupModule } from './modules/stackup/StackupModule';
import { PdnModule } from './modules/pdn/PdnModule';
import { LoopModule } from './modules/loop-inductance/LoopModule';

describe('render smoke test', () => {
  it('renders the app shell with Module 1 active', () => {
    const html = renderToString(<App />);
    expect(html).toContain('Where does return current flow?');
    expect(html).toContain('The Physics');
  });

  it('renders Module 2 in its pre-solve state', () => {
    const html = renderToString(<TraceFieldsModule />);
    expect(html).toContain('solving');
    expect(html).toContain('Characteristic impedance');
  });

  it('renders Module 4 with plot, builder table, and readouts', () => {
    const html = renderToString(<PdnModule />);
    expect(html).toContain('power distribution network');
    expect(html).toContain('PDN builder');
    expect(html).toContain('Self-resonant frequencies');
  });

  it('renders Module 5 with comparison strip, readouts, and bounce calculator', () => {
    const html = renderToString(<LoopModule />);
    expect(html).toContain('1 cm of loop, two ways');
    expect(html).toContain('Loop inductance L');
    expect(html).toContain('Ground bounce');
  });

  it('renders Module 3 with scorecard and plane-pair readouts', () => {
    const html = renderToString(<StackupModule />);
    expect(html).toContain('Stackup cross-section');
    expect(html).toContain('Scorecard');
    expect(html).toContain('interplane capacitance');
  });
});
