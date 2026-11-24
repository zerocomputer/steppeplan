import { useAppStore } from '../store';
import { Inspector } from './Inspector';
import { AIPanel } from './AIPanel';
import { Icon } from './Icons';

export function RightPanel() {
  const tab = useAppStore((state) => state.rightTab);
  const setTab = useAppStore((state) => state.setRightTab);
  const busy = useAppStore((state) => state.aiBusy);

  return (
    <aside className="panel right-panel">
      <div className="right-tabs">
        <button className={`right-tab ${tab === 'inspector' ? 'is-active' : ''}`} onClick={() => setTab('inspector')}>
          <Icon name="panel" size={13} />
          Инспектор
        </button>
        <button className={`right-tab ${tab === 'ai' ? 'is-active' : ''}`} onClick={() => setTab('ai')}>
          <Icon name="sparkles" size={13} />
          ИИ
          {busy && <span className="right-tab__pulse" />}
        </button>
      </div>
      <div className="right-body">{tab === 'ai' ? <AIPanel /> : <Inspector />}</div>
    </aside>
  );
}
