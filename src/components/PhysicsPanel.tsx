import type { ReactNode } from 'react';

/**
 * Collapsible "The Physics" panel. Every module renders one, stating the
 * model, governing equations, and assumptions (see CLAUDE.md, physics rule 5).
 */
export function PhysicsPanel({ children }: { children: ReactNode }) {
  return (
    <details className="physics-panel">
      <summary>The Physics</summary>
      <div className="physics-body">{children}</div>
    </details>
  );
}
