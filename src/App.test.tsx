/**
 * Render smoke test: server-renders the component tree (no DOM, no effects —
 * canvases and the solver worker stay inert) to catch runtime errors in
 * render bodies, including KaTeX equation rendering.
 */
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { App } from './App';
import { TraceFieldsModule } from './modules/trace-fields/TraceFieldsModule';

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
});
