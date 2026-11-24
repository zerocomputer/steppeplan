import { create } from 'zustand';
import { api } from './api';
import type {
  AiAction,
  AiMessage,
  Concept,
  EdgeKind,
  PlanNode,
  Project,
  ProviderConfig,
  Viewport,
  Workspace,
} from './types';

const PREFS_KEY = 'steppeplan.ui.v1';

interface Prefs {
  activeProjectId?: string | null;
  activeConceptId?: string | null;
  theme?: 'dark' | 'light';
  scale?: number;
}

function readPrefs(): Prefs {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') as Prefs;
  } catch {
    return {};
  }
}

function writePrefs(prefs: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

function initialTheme(): 'dark' | 'light' {
  const saved = readPrefs().theme;
  if (saved === 'dark' || saved === 'light') return saved;
  // Figma-like dark canvas is the intended first impression.
  return 'dark';
}

function initialUiScale(): number {
  const saved = readPrefs().scale;
  if (typeof saved === 'number' && saved >= 0.8 && saved <= 1.6) return saved;
  // 4K panels without OS scaling look tiny; start slightly larger there.
  if (typeof window !== 'undefined' && window.screen?.width >= 2800) return 1.2;
  return 1;
}

export type RightTab = 'inspector' | 'ai';
export type SettingsTab = 'ai' | 'appearance' | 'data';

interface AppState {
  workspace: Workspace | null;
  loading: boolean;
  bootError: string | null;
  activeProjectId: string | null;
  activeConceptId: string | null;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  rightTab: RightTab;
  settingsOpen: boolean;
  settingsTab: SettingsTab;
  theme: 'dark' | 'light';
  uiScale: number;
  saveState: 'saved' | 'saving';
  toast: string | null;
  focusRequest: { nodeId: string; nodeIds?: string[]; nonce: number } | null;
  aiByConcept: Record<string, AiMessage[]>;
  aiBusy: boolean;
  aiError: string | null;

  boot: () => Promise<void>;
  refresh: () => Promise<void>;
  setActiveProject: (projectId: string) => void;
  setActiveConcept: (conceptId: string) => void;
  selectNode: (nodeId: string | null, focus?: boolean) => void;
  selectEdge: (edgeId: string | null) => void;
  setRightTab: (tab: RightTab) => void;
  openSettings: (tab?: SettingsTab) => void;
  closeSettings: () => void;
  setSettingsTab: (tab: SettingsTab) => void;
  setTheme: (theme: 'dark' | 'light') => void;
  setUiScale: (scale: number) => void;
  notify: (message: string) => void;

  createProject: (name: string) => Promise<void>;
  updateProject: (id: string, patch: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  createConcept: (name: string) => Promise<void>;
  updateConcept: (id: string, patch: Partial<Concept>) => Promise<void>;
  deleteConcept: (id: string) => Promise<void>;
  addNode: (conceptId: string, patch: Partial<PlanNode> & { position?: { x: number; y: number } }) => Promise<PlanNode | null>;
  updateNode: (id: string, patch: Partial<PlanNode>) => Promise<void>;
  deleteNode: (id: string) => Promise<void>;
  addEdge: (conceptId: string, source: string, target: string, kind?: EdgeKind) => Promise<void>;
  updateEdge: (id: string, patch: { kind?: EdgeKind; label?: string; lane?: number }) => Promise<void>;
  deleteEdge: (id: string) => Promise<void>;
  savePositions: (conceptId: string, positions: Array<{ id: string; x: number; y: number }>, resetLanes?: boolean) => Promise<void>;
  saveViewport: (conceptId: string, viewport: Viewport) => Promise<void>;

  setActiveProvider: (id: string) => Promise<void>;
  updateProvider: (id: string, patch: Partial<ProviderConfig> & { apiKey?: string }) => Promise<boolean>;

  sendAi: (text: string) => Promise<void>;
  clearAi: () => void;
}

function syncWorkspace(state: AppState, workspace: Workspace) {
  const projects = workspace.projects;
  let activeProjectId = state.activeProjectId;
  if (!projects.some((p) => p.id === activeProjectId)) {
    activeProjectId = projects[0]?.id ?? null;
  }
  const project = projects.find((p) => p.id === activeProjectId);
  let activeConceptId = state.activeConceptId;
  if (!project?.concepts.some((c) => c.id === activeConceptId)) {
    activeConceptId = project?.concepts[0]?.id ?? null;
  }
  const concept = project?.concepts.find((c) => c.id === activeConceptId);
  const selectedNodeId = concept?.nodes.some((n) => n.id === state.selectedNodeId)
    ? state.selectedNodeId
    : null;
  const selectedEdgeId = concept?.edges.some((e) => e.id === state.selectedEdgeId)
    ? state.selectedEdgeId
    : null;

  writePrefs({
    activeProjectId,
    activeConceptId,
    theme: state.theme,
    scale: state.uiScale,
  });

  return { workspace, activeProjectId, activeConceptId, selectedNodeId, selectedEdgeId, loading: false };
}

function messageId() {
  return `msg_${Math.random().toString(36).slice(2, 10)}`;
}

export const useAppStore = create<AppState>()((set, get) => ({
  workspace: null,
  loading: true,
  bootError: null,
  activeProjectId: null,
  activeConceptId: null,
  selectedNodeId: null,
  selectedEdgeId: null,
  rightTab: 'inspector',
  settingsOpen: false,
  settingsTab: 'ai',
  theme: initialTheme(),
  uiScale: initialUiScale(),
  saveState: 'saved',
  toast: null,
  focusRequest: null,
  aiByConcept: {},
  aiBusy: false,
  aiError: null,

  boot: async () => {
    set({ loading: true, bootError: null });
    try {
      const { workspace } = await api.getWorkspace();
      const prefs = readPrefs();
      set((state) => {
        const seeded = syncWorkspace(
          {
            ...state,
            activeProjectId: prefs.activeProjectId ?? state.activeProjectId,
            activeConceptId: prefs.activeConceptId ?? state.activeConceptId,
            theme: prefs.theme ?? state.theme,
          },
          workspace,
        );
        return seeded;
      });
    } catch (error) {
      set({ loading: false, bootError: (error as Error).message });
    }
  },

  refresh: async () => {
    try {
      const { workspace } = await api.getWorkspace();
      set((state) => {
        if (state.workspace && workspace.revision <= state.workspace.revision) return {};
        const previousConcept = state.workspace?.projects
          .flatMap((project) => project.concepts)
          .find((concept) => concept.id === state.activeConceptId);
        const nextConcept = workspace.projects
          .flatMap((project) => project.concepts)
          .find((concept) => concept.id === state.activeConceptId);
        const known = new Set(previousConcept?.nodes.map((node) => node.id) ?? []);
        const freshNode = nextConcept?.nodes.find((node) => !known.has(node.id));
        return {
          ...syncWorkspace(state, workspace),
          selectedNodeId: freshNode ? freshNode.id : state.selectedNodeId,
          selectedEdgeId: freshNode ? null : state.selectedEdgeId,
          focusRequest: freshNode
            ? { nodeId: freshNode.id, nodeIds: [freshNode.id], nonce: Date.now() }
            : state.focusRequest,
        };
      });
    } catch {
      /* keep last known state; SSE will retry */
    }
  },

  setActiveProject: (projectId) => {
    set((state) => {
      const project = state.workspace?.projects.find((p) => p.id === projectId);
      if (!project) return {};
      writePrefs({
        activeProjectId: projectId,
        activeConceptId: project.concepts[0]?.id ?? null,
        theme: state.theme,
        scale: state.uiScale,
      });
      return {
        activeProjectId: projectId,
        activeConceptId: project.concepts[0]?.id ?? null,
        selectedNodeId: null,
        selectedEdgeId: null,
      };
    });
  },

  setActiveConcept: (conceptId) => {
    set((state) => {
      const project = state.workspace?.projects.find((p) => p.concepts.some((c) => c.id === conceptId));
      if (!project) return {};
      writePrefs({
        activeProjectId: project.id,
        activeConceptId: conceptId,
        theme: state.theme,
        scale: state.uiScale,
      });
      return {
        activeProjectId: project.id,
        activeConceptId: conceptId,
        selectedNodeId: null,
        selectedEdgeId: null,
      };
    });
  },

  selectNode: (nodeId, focus = false) => {
    const state = get();
    if (state.selectedNodeId === nodeId && !focus) return;
    set({
      selectedNodeId: nodeId,
      selectedEdgeId: null,
      rightTab: nodeId ? 'inspector' : state.rightTab,
      focusRequest: focus && nodeId ? { nodeId, nonce: Date.now() } : state.focusRequest,
    });
  },

  selectEdge: (edgeId) => {
    const state = get();
    if (state.selectedEdgeId === edgeId && !edgeId) return;
    set({ selectedEdgeId: edgeId, selectedNodeId: null, rightTab: edgeId ? 'inspector' : state.rightTab });
  },

  setRightTab: (tab) => set({ rightTab: tab }),
  openSettings: (tab) => set({ settingsOpen: true, settingsTab: tab ?? get().settingsTab }),
  closeSettings: () => set({ settingsOpen: false }),
  setSettingsTab: (tab) => set({ settingsTab: tab }),
  setTheme: (theme) => {
    const state = get();
    writePrefs({
      activeProjectId: state.activeProjectId,
      activeConceptId: state.activeConceptId,
      theme,
      scale: state.uiScale,
    });
    set({ theme });
  },

  setUiScale: (scale) => {
    const next = Math.min(1.6, Math.max(0.8, Math.round(scale * 100) / 100));
    const state = get();
    writePrefs({
      activeProjectId: state.activeProjectId,
      activeConceptId: state.activeConceptId,
      theme: state.theme,
      scale: next,
    });
    set({ uiScale: next });
  },

  notify: (message) => {
    set({ toast: message });
    window.setTimeout(() => {
      if (useAppStore.getState().toast === message) set({ toast: null });
    }, 3200);
  },

  createProject: async (name) => {
    set({ saveState: 'saving' });
    try {
      const created = await api.createProject({ name });
      const project = created.entity as Project;
      const conceptEnvelope = await api.createConcept(project.id, { name: 'Основная концепция' });
      const concept = conceptEnvelope.entity as Concept;
      set((state) => {
        const synced = syncWorkspace(state, conceptEnvelope.workspace);
        return {
          ...synced,
          saveState: 'saved',
          activeProjectId: project.id,
          activeConceptId: concept.id,
          selectedNodeId: null,
          selectedEdgeId: null,
        };
      });
    } catch (error) {
      set({ saveState: 'saved' });
      get().notify((error as Error).message);
    }
  },

  updateProject: async (id, patch) => {
    set({ saveState: 'saving' });
    try {
      const result = await api.updateProject(id, patch);
      set((state) => ({ ...syncWorkspace(state, result.workspace), saveState: 'saved' }));
    } catch (error) {
      set({ saveState: 'saved' });
      get().notify((error as Error).message);
    }
  },

  deleteProject: async (id) => {
    try {
      const result = await api.deleteProject(id);
      set((state) => {
        const synced = syncWorkspace({ ...state, activeProjectId: null, activeConceptId: null }, result.workspace);
        return { ...synced, selectedNodeId: null, selectedEdgeId: null };
      });
    } catch (error) {
      get().notify((error as Error).message);
    }
  },

  createConcept: async (name) => {
    const projectId = get().activeProjectId;
    if (!projectId) return;
    set({ saveState: 'saving' });
    try {
      const result = await api.createConcept(projectId, {
        name,
        color: ['#9747FF', '#0D99FF', '#14AE5C', '#F24822', '#FFCD29'][Math.floor(Math.random() * 5)],
      });
      const concept = result.entity as Concept;
      set((state) => ({
        ...syncWorkspace(state, result.workspace),
        saveState: 'saved',
        activeProjectId: projectId,
        activeConceptId: concept.id,
        selectedNodeId: null,
        selectedEdgeId: null,
      }));
    } catch (error) {
      set({ saveState: 'saved' });
      get().notify((error as Error).message);
    }
  },

  updateConcept: async (id, patch) => {
    set({ saveState: 'saving' });
    try {
      const result = await api.updateConcept(id, patch);
      set((state) => ({ ...syncWorkspace(state, result.workspace), saveState: 'saved' }));
    } catch (error) {
      set({ saveState: 'saved' });
      get().notify((error as Error).message);
    }
  },

  deleteConcept: async (id) => {
    try {
      const result = await api.deleteConcept(id);
      set((state) => ({ ...syncWorkspace({ ...state, activeConceptId: null }, result.workspace), selectedNodeId: null, selectedEdgeId: null }));
    } catch (error) {
      get().notify((error as Error).message);
    }
  },

  addNode: async (conceptId, patch) => {
    set({ saveState: 'saving' });
    try {
      const result = await api.addNode(conceptId, patch);
      const node = result.entity as PlanNode;
      set((state) => ({
        ...syncWorkspace(state, result.workspace),
        saveState: 'saved',
        selectedNodeId: node.id,
        selectedEdgeId: null,
        rightTab: 'inspector',
      }));
      return node;
    } catch (error) {
      set({ saveState: 'saved' });
      get().notify((error as Error).message);
      return null;
    }
  },

  updateNode: async (id, patch) => {
    set({ saveState: 'saving' });
    try {
      const result = await api.updateNode(id, patch);
      set((state) => ({ ...syncWorkspace(state, result.workspace), saveState: 'saved' }));
    } catch (error) {
      set({ saveState: 'saved' });
      get().notify((error as Error).message);
    }
  },

  deleteNode: async (id) => {
    try {
      const result = await api.deleteNode(id);
      set((state) => ({
        ...syncWorkspace(state, result.workspace),
        selectedNodeId: null,
        selectedEdgeId: null,
      }));
    } catch (error) {
      get().notify((error as Error).message);
    }
  },

  addEdge: async (conceptId, source, target, kind = 'relates') => {
    try {
      const result = await api.addEdge(conceptId, { source, target, kind });
      const edge = result.entity as { id: string };
      set((state) => ({
        ...syncWorkspace(state, result.workspace),
        selectedEdgeId: edge.id,
        selectedNodeId: null,
        rightTab: 'inspector',
      }));
    } catch (error) {
      get().notify((error as Error).message);
    }
  },

  updateEdge: async (id, patch) => {
    try {
      const result = await api.updateEdge(id, patch);
      set((state) => syncWorkspace(state, result.workspace));
    } catch (error) {
      get().notify((error as Error).message);
    }
  },

  deleteEdge: async (id) => {
    try {
      const result = await api.deleteEdge(id);
      set((state) => ({ ...syncWorkspace(state, result.workspace), selectedEdgeId: null }));
    } catch (error) {
      get().notify((error as Error).message);
    }
  },

  savePositions: async (conceptId, positions, resetLanes = false) => {
    try {
      const result = await api.savePositions(conceptId, positions, resetLanes);
      set((state) => syncWorkspace(state, result.workspace));
    } catch {
      get().notify('Не удалось сохранить положение узлов');
    }
  },

  saveViewport: async (conceptId, viewport) => {
    try {
      const result = await api.updateConcept(conceptId, { viewport });
      set({ workspace: result.workspace });
    } catch {
      /* non-critical */
    }
  },

  setActiveProvider: async (id) => {
    try {
      const result = await api.setActiveProvider(id);
      set((state) => syncWorkspace(state, result.workspace));
    } catch (error) {
      get().notify((error as Error).message);
    }
  },

  updateProvider: async (id, patch) => {
    try {
      const result = await api.updateProvider(id, patch);
      set((state) => syncWorkspace(state, result.workspace));
      if (patch.apiKey !== undefined) {
        get().notify(patch.apiKey ? 'Ключ сохранён локально' : 'Ключ удалён');
      } else {
        get().notify('Провайдер сохранён');
      }
      return true;
    } catch (error) {
      get().notify((error as Error).message);
      return false;
    }
  },

  sendAi: async (text) => {
    const state = get();
    const conceptId = state.activeConceptId;
    const trimmed = text.trim();
    if (!conceptId || !trimmed || state.aiBusy) return;

    const userMessage: AiMessage = { id: messageId(), role: 'user', content: trimmed };
    const history = [...(state.aiByConcept[conceptId] || []), userMessage];
    set({
      aiByConcept: { ...state.aiByConcept, [conceptId]: history },
      aiBusy: true,
      aiError: null,
    });

    try {
      const response = await api.chat({
        conceptId,
        messages: history.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })),
        selection: state.selectedNodeId ? [state.selectedNodeId] : [],
      });
      const actions: AiAction[] = response.actions || [];
      const assistantMessage: AiMessage = {
        id: messageId(),
        role: 'assistant',
        content: response.reply,
        actions,
        provider: response.provider?.name,
      };
      const created = actions.find((action) => action.kind === 'node_created' && action.id);
      set((current) => ({
        ...syncWorkspace(current, response.workspace),
        aiByConcept: {
          ...current.aiByConcept,
          [conceptId]: [...(current.aiByConcept[conceptId] || []), assistantMessage],
        },
        aiBusy: false,
        selectedNodeId: created?.id ? String(created.id) : current.selectedNodeId,
        selectedEdgeId: created?.id ? null : current.selectedEdgeId,
        focusRequest:
          actions.some((action) => action.kind === 'node_created' && action.id)
            ? {
                nodeId: String(actions.find((action) => action.kind === 'node_created' && action.id)?.id),
                nodeIds: actions
                  .filter((action) => action.kind === 'node_created' && action.id)
                  .map((action) => String(action.id)),
                nonce: Date.now(),
              }
            : current.focusRequest,
      }));
    } catch (error) {
      set((current) => ({
        aiByConcept: {
          ...current.aiByConcept,
          [conceptId]: [
            ...(current.aiByConcept[conceptId] || []),
            { id: messageId(), role: 'assistant', content: (error as Error).message, error: true },
          ],
        },
        aiBusy: false,
        aiError: (error as Error).message,
      }));
    }
  },

  clearAi: () => {
    const conceptId = get().activeConceptId;
    if (!conceptId) return;
    set((state) => {
      const next = { ...state.aiByConcept };
      delete next[conceptId];
      return { aiByConcept: next, aiError: null };
    });
  },
}));

export const useActiveProject = (): Project | null =>
  useAppStore((state) => state.workspace?.projects.find((p) => p.id === state.activeProjectId) ?? null);

export const useActiveConcept = (): Concept | null =>
  useAppStore((state) => {
    const project = state.workspace?.projects.find((p) => p.id === state.activeProjectId);
    return project?.concepts.find((c) => c.id === state.activeConceptId) ?? null;
  });

export const useActiveProvider = (): ProviderConfig | null =>
  useAppStore((state) => {
    const settings = state.workspace?.settings;
    if (!settings) return null;
    return settings.providers.find((p) => p.id === settings.activeProviderId) ?? settings.providers[0] ?? null;
  });

export type { AppState };
