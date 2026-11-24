export type NodeType = 'concept' | 'question' | 'decision' | 'task' | 'risk' | 'source' | 'note' | 'table';
export type EdgeKind = 'supports' | 'depends' | 'refines' | 'contradicts' | 'relates';
export type NodeStatus = 'open' | 'active' | 'done' | 'parked';
export type NodeOrigin = 'human' | 'ai' | 'mcp' | 'seed';
export interface PlanTable {
  columns: string[];
  rows: string[][];
}


export interface PlanNode {
  id: string;
  type: NodeType;
  title: string;
  summary: string;
  body: string;
  tags: string[];
  status: NodeStatus;
  origin: NodeOrigin;
  x: number;
  y: number;
  width?: number;
  height?: number;
  table?: PlanTable;
  createdAt: string;
  updatedAt: string;
}

export interface PlanEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  label: string;
  lane?: number;
  createdAt: string;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface Concept {
  id: string;
  name: string;
  description: string;
  color: string;
  viewport: Viewport;
  nodes: PlanNode[];
  edges: PlanEdge[];
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  concepts: Concept[];
  createdAt: string;
  updatedAt: string;
}

export interface ProviderConfig {
  id: string;
  name: string;
  kind: 'demo' | 'openai' | 'anthropic';
  baseUrl: string;
  model: string;
  hasKey?: boolean;
}

export interface Settings {
  activeProviderId: string;
  providers: ProviderConfig[];
}

export interface Workspace {
  schemaVersion: number;
  revision: number;
  updatedAt: string;
  projects: Project[];
  settings: Settings;
}

export interface WorkspaceEnvelope {
  workspace: Workspace;
  revision: number;
  entity?: unknown;
}

export interface AiAction {
  kind: string;
  id?: string;
  title?: string;
  nodeType?: NodeType;
  linkedTo?: string | null;
  [key: string]: unknown;
}

export interface AiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  actions?: AiAction[];
  provider?: string;
  error?: boolean;
}

export interface AiResponse {
  reply: string;
  actions: AiAction[];
  provider: { id: string; name: string; model: string };
  workspace: Workspace;
}

export interface AppInfo {
  version: string;
  desktop?: boolean;
  home: string;
  dataFile: string;
  projects: number;
  revision: number;
  mcp: {
    command: string;
    args: string[];
    config: Record<string, unknown>;
  };
}
