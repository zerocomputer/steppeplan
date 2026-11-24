import { useEffect, useState, type CSSProperties } from 'react';
import { useAppStore } from './store';
import { TopBar, BrandMark } from './components/TopBar';
import { LeftPanel } from './components/LeftPanel';
import { Canvas } from './components/Canvas';
import { RightPanel } from './components/RightPanel';
import { SettingsModal } from './components/SettingsModal';
import { PanelResizer } from './components/PanelResizer';
import { isTauriRuntime, setNativeUiScale } from './lib/native';

const PANELS_KEY = 'steppeplan.panels.v1';
const PANEL_DEFAULTS = { left: 258, right: 338 };

function readPanelWidths() {
  try {
    const saved = JSON.parse(localStorage.getItem(PANELS_KEY) || '{}') as {
      left?: number;
      right?: number;
    };
    return {
      left:
        typeof saved.left === 'number' && saved.left >= 200 && saved.left <= 480
          ? saved.left
          : PANEL_DEFAULTS.left,
      right:
        typeof saved.right === 'number' && saved.right >= 280 && saved.right <= 560
          ? saved.right
          : PANEL_DEFAULTS.right,
    };
  } catch {
    return { ...PANEL_DEFAULTS };
  }
}

export function App() {
  const [leftWidth, setLeftWidth] = useState(() => readPanelWidths().left);
  const [rightWidth, setRightWidth] = useState(() => readPanelWidths().right);
  const boot = useAppStore((state) => state.boot);
  const loading = useAppStore((state) => state.loading);
  const bootError = useAppStore((state) => state.bootError);
  const theme = useAppStore((state) => state.theme);
  const uiScale = useAppStore((state) => state.uiScale);
  const toast = useAppStore((state) => state.toast);
  const refresh = useAppStore((state) => state.refresh);
  const notify = useAppStore((state) => state.notify);

  useEffect(() => {
    void boot();
  }, [boot]);

  useEffect(() => {
    try {
      localStorage.setItem(PANELS_KEY, JSON.stringify({ left: leftWidth, right: rightWidth }));
    } catch {
      /* ignore */
    }
  }, [leftWidth, rightWidth]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    if (!isTauriRuntime()) {
      // Browser fallback: CSS zoom scales chrome and canvas together.
      document.documentElement.style.setProperty('--ui-scale', String(uiScale));
      return;
    }
    // Desktop: let the webview zoom itself, so React Flow coordinates and
    // dragging stay accurate. The app then fills the (already zoomed) viewport.
    document.documentElement.style.setProperty('--ui-scale', '1');
    const timer = window.setTimeout(() => {
      void setNativeUiScale(uiScale).then((ok) => {
        if (!cancelled && !ok) {
          document.documentElement.style.setProperty('--ui-scale', String(uiScale));
        }
      });
    }, 40);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [uiScale]);

  useEffect(() => {
    const source = new EventSource('/api/events');
    source.addEventListener('change', (event) => {
      void refresh();
      try {
        const data = JSON.parse((event as MessageEvent).data) as { source?: string };
        if (data.source === 'mcp') notify('MCP-агент обновил граф');
      } catch {
        /* ignore malformed events */
      }
    });
    return () => source.close();
  }, [refresh, notify]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const state = useAppStore.getState();
      if (state.settingsOpen) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;

      if (event.key === 'Escape') {
        state.selectNode(null);
        return;
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && (state.selectedNodeId || state.selectedEdgeId)) {
        event.preventDefault();
        if (state.selectedNodeId) {
          void state.deleteNode(state.selectedNodeId);
        } else if (state.selectedEdgeId) {
          void state.deleteEdge(state.selectedEdgeId);
        }
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'i') {
        event.preventDefault();
        state.setRightTab(state.rightTab === 'ai' ? 'inspector' : 'ai');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (loading) {
    return (
      <div className="boot">
        <BrandMark size={46} />
        <h1>SteppePlan</h1>
        <p>Собираем локальное рабочее пространство…</p>
        <span className="boot__spinner" />
      </div>
    );
  }

  if (bootError) {
    return (
      <div className="boot boot--error">
        <BrandMark size={46} />
        <h1>Сервер не отвечает</h1>
        <p>{bootError}</p>
        <p className="boot__hint">
          Запустите <code>npm start</code> в корне репозитория и обновите страницу.
        </p>
        <button className="btn btn--primary" onClick={() => void boot()}>
          Попробовать снова
        </button>
      </div>
    );
  }

  return (
    <div className={`app ${uiScale > 1.08 ? 'app--scaled' : ''}`}>
      <TopBar />
      <div
        className="app-body"
        style={
          {
            '--left-width': `${leftWidth}px`,
            '--right-width': `${rightWidth}px`,
          } as CSSProperties
        }
      >
        <LeftPanel />
        <PanelResizer
          side="left"
          width={leftWidth}
          min={200}
          max={480}
          defaultValue={PANEL_DEFAULTS.left}
          onChange={setLeftWidth}
        />
        <Canvas />
        <PanelResizer
          side="right"
          width={rightWidth}
          min={280}
          max={560}
          defaultValue={PANEL_DEFAULTS.right}
          onChange={setRightWidth}
        />
        <RightPanel />
      </div>
      <SettingsModal />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
