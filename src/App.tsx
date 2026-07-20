import { useState, type ComponentType } from 'react';
import { Sidebar } from './components/Sidebar';
import { MODULES } from './modules/registry';
import { StubModule } from './modules/StubModule';
import { ReturnCurrentModule } from './modules/return-current/ReturnCurrentModule';
import { TraceFieldsModule } from './modules/trace-fields/TraceFieldsModule';
import { StackupModule } from './modules/stackup/StackupModule';
import { PdnModule } from './modules/pdn/PdnModule';
import { LoopModule } from './modules/loop-inductance/LoopModule';
import { CrosstalkModule } from './modules/crosstalk/CrosstalkModule';

const MODULE_COMPONENTS: Record<string, ComponentType> = {
  'return-current': ReturnCurrentModule,
  'trace-fields': TraceFieldsModule,
  'stackup-explorer': StackupModule,
  decoupling: PdnModule,
  'loop-inductance': LoopModule,
  crosstalk: CrosstalkModule,
};

export function App() {
  const [activeId, setActiveId] = useState('return-current');
  const info = MODULES.find((m) => m.id === activeId) ?? MODULES[0]!;

  return (
    <div className="app">
      <Sidebar activeId={info.id} onSelect={setActiveId} />
      <main className="main">
        <header className="module-header">
          <h2>{info.title}</h2>
          {info.status === 'ready' && <p>{info.description}</p>}
        </header>
        {(() => {
          const Module = MODULE_COMPONENTS[info.id];
          return Module ? <Module /> : <StubModule info={info} />;
        })()}
      </main>
    </div>
  );
}
