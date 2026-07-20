import { useMemo } from 'react';
import katex from 'katex';

interface EquationProps {
  tex: string;
  /** Render as a centered display equation (block) instead of inline. */
  display?: boolean;
}

/** KaTeX equation. All equations in the app go through this component. */
export function Equation({ tex, display = false }: EquationProps) {
  const html = useMemo(
    () => katex.renderToString(tex, { displayMode: display, throwOnError: false }),
    [tex, display],
  );
  return display ? (
    <div className="eq-block" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <span dangerouslySetInnerHTML={{ __html: html }} />
  );
}
