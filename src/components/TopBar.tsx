import { useAppStore, useActiveConcept, useActiveProject } from '../store';
import { Icon } from './Icons';

export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="url(#brand-gradient)" />
      <path
        d="M8 22.5c4.3-.9 6.5-3.7 7.5-6.8 1-3.1 3.2-5.4 8.5-5.7-4.3 1-6.4 3.8-7.4 6.9-1 3-3.3 5.3-8.6 5.6z"
        fill="white"
        fillOpacity="0.95"
      />
      <circle cx="24" cy="8" r="1.7" fill="white" fillOpacity="0.9" />
      <defs>
        <linearGradient id="brand-gradient" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0D99FF" />
          <stop offset="1" stopColor="#7B4DFF" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function TopBar() {
  const project = useActiveProject();
  const concept = useActiveConcept();
  const saveState = useAppStore((s) => s.saveState);
  const theme = useAppStore((s) => s.theme);
  const rightTab = useAppStore((s) => s.rightTab);
  const setTheme = useAppStore((s) => s.setTheme);
  const openSettings = useAppStore((s) => s.openSettings);
  const setRightTab = useAppStore((s) => s.setRightTab);
  const selectedNodeId = useAppStore((s) => s.selectedNodeId);
  const selectedNode = concept?.nodes.find((node) => node.id === selectedNodeId) ?? null;

  return (
    <header className="topbar">
      <div className="topbar__brand">
        <BrandMark />
        <div className="topbar__name">SteppePlan</div>
      </div>

      <div className="topbar__divider" />

      <div className="breadcrumb">
        <span className="breadcrumb__item">
          <Icon name="folder" size={13} />
          {project?.name ?? 'Проект'}
        </span>
        <Icon name="chevron-right" size={12} className="breadcrumb__sep" />
        <span className="breadcrumb__item breadcrumb__item--active">
          <span className="dot" style={{ background: concept?.color ?? 'var(--muted)' }} />
          {concept?.name ?? 'Концепция'}
        </span>
        {selectedNode && (
          <>
            <Icon name="chevron-right" size={12} className="breadcrumb__sep" />
            <span className="breadcrumb__item breadcrumb__item--muted" title={selectedNode.title}>
              {selectedNode.title}
            </span>
          </>
        )}
      </div>

      <div className="topbar__spacer" />

      <div className={`save-indicator ${saveState === 'saving' ? 'is-saving' : ''}`}>
        <span className="save-indicator__dot" />
        {saveState === 'saving' ? 'Сохраняем…' : 'Сохранено локально'}
      </div>

      <div className="local-badge" title="Данные лежат в ~/.steppeplan/workspace.json. Облако — опционально и позже.">
        <Icon name="lock" size={12} />
        Локально
      </div>

      <button
        className="icon-btn"
        title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      >
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
      </button>

      <button className="icon-btn" title="Настройки" onClick={() => openSettings('ai')}>
        <Icon name="settings" size={16} />
      </button>

      <button
        className={`btn btn--ai ${rightTab === 'ai' ? 'is-active' : ''}`}
        onClick={() => setRightTab(rightTab === 'ai' ? 'inspector' : 'ai')}
        title="ИИ-ассистент"
      >
        <Icon name="sparkles" size={14} />
        ИИ
      </button>
    </header>
  );
}
