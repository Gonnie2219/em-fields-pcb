import type { ModuleInfo } from './registry';

export function StubModule({ info }: { info: ModuleInfo }) {
  return (
    <div className="stub">
      <span className="coming">coming soon</span>
      <p>{info.description}</p>
    </div>
  );
}
