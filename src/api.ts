import type {
  AppInfo,
  AiResponse,
  Concept,
  PlanEdge,
  PlanNode,
  Project,
  ProviderConfig,
  Workspace,
  WorkspaceEnvelope,
} from './types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    });
  } catch {
    throw new Error('Локальный сервер недоступен. Запущен ли он?');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || `Ошибка ${response.status}`);
  }
  return data as T;
}

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });

export const api = {
  getWorkspace: () => request<{ workspace: Workspace }>('/api/workspace'),
  getInfo: () => request<AppInfo>('/api/info'),

  createProject: (body: { name: string; description?: string }) =>
    request<WorkspaceEnvelope>('/api/projects', { method: 'POST', ...json(body) }),
  updateProject: (id: string, body: Partial<Project>) =>
    request<WorkspaceEnvelope>(`/api/projects/${encodeURIComponent(id)}`, { method: 'PATCH', ...json(body) }),
  deleteProject: (id: string) =>
    request<WorkspaceEnvelope>(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  createConcept: (projectId: string, body: { name: string; description?: string; color?: string }) =>
    request<WorkspaceEnvelope>(`/api/projects/${encodeURIComponent(projectId)}/concepts`, {
      method: 'POST',
      ...json(body),
    }),
  updateConcept: (id: string, body: Partial<Concept>) =>
    request<WorkspaceEnvelope>(`/api/concepts/${encodeURIComponent(id)}`, { method: 'PATCH', ...json(body) }),
  deleteConcept: (id: string) =>
    request<WorkspaceEnvelope>(`/api/concepts/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  addNode: (conceptId: string, body: Partial<PlanNode> & { position?: { x: number; y: number } }) =>
    request<WorkspaceEnvelope>(`/api/concepts/${encodeURIComponent(conceptId)}/nodes`, {
      method: 'POST',
      ...json(body),
    }),
  updateNode: (id: string, body: Partial<PlanNode>) =>
    request<WorkspaceEnvelope>(`/api/nodes/${encodeURIComponent(id)}`, { method: 'PATCH', ...json(body) }),
  deleteNode: (id: string) =>
    request<WorkspaceEnvelope>(`/api/nodes/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  savePositions: (
    conceptId: string,
    positions: Array<{ id: string; x: number; y: number }>,
    resetLanes = false,
  ) =>
    request<WorkspaceEnvelope>(`/api/concepts/${encodeURIComponent(conceptId)}/positions`, {
      method: 'PATCH',
      ...json({ positions, resetLanes }),
    }),

  addEdge: (
    conceptId: string,
    body: { source: string; target: string; kind?: PlanEdge['kind']; label?: string },
  ) =>
    request<WorkspaceEnvelope>(`/api/concepts/${encodeURIComponent(conceptId)}/edges`, {
      method: 'POST',
      ...json(body),
    }),
  updateEdge: (id: string, body: Partial<PlanEdge>) =>
    request<WorkspaceEnvelope>(`/api/edges/${encodeURIComponent(id)}`, { method: 'PATCH', ...json(body) }),
  deleteEdge: (id: string) =>
    request<WorkspaceEnvelope>(`/api/edges/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  setActiveProvider: (activeProviderId: string) =>
    request<WorkspaceEnvelope>('/api/settings', { method: 'PATCH', ...json({ activeProviderId }) }),
  updateProvider: (id: string, body: Partial<ProviderConfig> & { apiKey?: string }) =>
    request<WorkspaceEnvelope>(`/api/providers/${encodeURIComponent(id)}`, { method: 'PATCH', ...json(body) }),
  testProvider: (id: string) =>
    request<{ ok: boolean; message: string }>(`/api/providers/${encodeURIComponent(id)}/test`, {
      method: 'POST',
      ...json({}),
    }),

  chat: (body: { conceptId: string; messages: Array<{ role: string; content: string }>; selection: string[] }) =>
    request<AiResponse>('/api/ai/chat', { method: 'POST', ...json(body) }),
};
