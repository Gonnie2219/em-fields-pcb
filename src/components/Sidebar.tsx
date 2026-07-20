import { MODULE_GROUPS, MODULES } from '../modules/registry';

interface SidebarProps {
  activeId: string;
  onSelect: (id: string) => void;
}

export function Sidebar({ activeId, onSelect }: SidebarProps) {
  return (
    <nav className="sidebar">
      <h1>
        EM Fields on PCBs
        <small>an interactive field guide</small>
      </h1>
      {MODULE_GROUPS.map((group) => (
        <div className="sidebar-group" key={group}>
          <div className="group-label">{group}</div>
          {MODULES.filter((m) => m.group === group).map((m) => (
            <button
              key={m.id}
              className={`module-link${m.id === activeId ? ' active' : ''}`}
              onClick={() => onSelect(m.id)}
            >
              <span>{m.title}</span>
              {m.status === 'soon' && <span className="badge-soon">soon</span>}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}
