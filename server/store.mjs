import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { nanoid } from 'nanoid';
import { createSeedWorkspace } from './seed.mjs';

export const HOME = process.env.STEPPEPLAN_HOME
  ? path.resolve(process.env.STEPPEPLAN_HOME)
  : path.join(os.homedir(), '.steppeplan');

export const DATA_FILE = path.join(HOME, 'workspace.json');
const SECRETS_FILE = path.join(HOME, 'secrets.json');

export const events = new EventEmitter();

const LOCK_DIR = path.join(HOME, '.workspace.lock');
const now = () => new Date().toISOString();
export const id = (prefix) => `${prefix}_${nanoid(10)}`;

function ensureHome() {
  fs.mkdirSync(HOME, { recursive: true });
}

// Tiny cross-process advisory lock. The HTTP server and the MCP server are
// separate processes sharing one JSON file, so read-modify-write must not
// interleave. Synchronous by design: store operations are quick and the MCP
// SDK expects sync tool handlers to resolve immediately.
let lockDepth = 0;

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function acquireLock(timeoutMs = 4000) {
  if (lockDepth > 0) {
    lockDepth += 1;
    return;
  }
  ensureHome();
  const started = Date.now();
  for (;;) {
    try {
      fs.mkdirSync(LOCK_DIR);
      lockDepth = 1;
      return;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        const stat = fs.statSync(LOCK_DIR);
        if (Date.now() - stat.mtimeMs > 10_000) {
          fs.rmdirSync(LOCK_DIR);
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() - started > timeoutMs) {
        throw new Error('Не удалось получить блокировку workspace. Попробуйте ещё раз.');
      }
      sleepSync(15);
    }
  }
}

function releaseLock() {
  if (lockDepth > 1) {
    lockDepth -= 1;
    return;
  }
  lockDepth = 0;
  try {
    fs.rmdirSync(LOCK_DIR);
  } catch {
    /* already released */
  }
}

function atomicWrite(file, data) {
  ensureHome();
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, data, 'utf8');
  fs.renameSync(tmp, file);
}

export function readWorkspace() {
  ensureHome();
  if (!fs.existsSync(DATA_FILE)) {
    acquireLock();
    try {
      if (!fs.existsSync(DATA_FILE)) {
        const seeded = createSeedWorkspace();
        atomicWrite(DATA_FILE, JSON.stringify(seeded, null, 2));
        return seeded;
      }
    } finally {
      releaseLock();
    }
  }
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  try {
    const workspace = JSON.parse(raw);
    return workspace;
  } catch (error) {
    throw new Error(
      `Не удалось прочитать ${DATA_FILE}: файл повреждён (${error.message}). Сделайте резервную копию и исправьте JSON.`,
    );
  }
}

export function saveWorkspace(workspace, source = 'system') {
  workspace.revision = (workspace.revision ?? 0) + 1;
  workspace.updatedAt = now();
  atomicWrite(DATA_FILE, JSON.stringify(workspace, null, 2));
  events.emit('change', { revision: workspace.revision, source, workspace });
  return workspace;
}

/** Read → mutate → write. Mutator changes `workspace` in place and may return a value. */
export function mutate(source, mutator) {
  acquireLock();
  try {
    // Re-read after taking the lock: another process may have just written.
    const workspace = readWorkspace();
    const result = mutator(workspace);
    saveWorkspace(workspace, source);
    return { workspace, result };
  } finally {
    releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export class NotFound extends Error {}

export function getProject(workspace, projectId) {
  const project = workspace.projects.find((p) => p.id === projectId);
  if (!project) throw new NotFound(`Проект ${projectId} не найден`);
  return project;
}

export function getConcept(workspace, conceptId) {
  for (const project of workspace.projects) {
    const concept = project.concepts.find((c) => c.id === conceptId);
    if (concept) return { project, concept };
  }
  throw new NotFound(`Концепция ${conceptId} не найдена`);
}

export function findNode(workspace, nodeId) {
  for (const project of workspace.projects) {
    for (const concept of project.concepts) {
      const node = concept.nodes.find((n) => n.id === nodeId);
      if (node) return { project, concept, node };
    }
  }
  throw new NotFound(`Узел ${nodeId} не найден`);
}

export function findEdge(workspace, edgeId) {
  for (const project of workspace.projects) {
    for (const concept of project.concepts) {
      const edge = concept.edges.find((e) => e.id === edgeId);
      if (edge) return { project, concept, edge };
    }
  }
  throw new NotFound(`Связь ${edgeId} не найдена`);
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export function createProject(workspace, { name, description = '' }) {
  const project = {
    id: id('prj'),
    name: name?.trim() || 'Новый проект',
    description,
    color: '#0D99FF',
    concepts: [],
    createdAt: now(),
    updatedAt: now(),
  };
  workspace.projects.unshift(project);
  return project;
}

export function updateProject(workspace, projectId, patch) {
  const project = getProject(workspace, projectId);
  for (const key of ['name', 'description', 'color']) {
    if (patch[key] !== undefined) project[key] = patch[key];
  }
  project.updatedAt = now();
  return project;
}

export function deleteProject(workspace, projectId) {
  const project = getProject(workspace, projectId);
  workspace.projects = workspace.projects.filter((p) => p.id !== projectId);
  return project;
}

// ---------------------------------------------------------------------------
// Concepts
// ---------------------------------------------------------------------------

const emptyGraph = () => ({ nodes: [], edges: [] });

export function createConcept(workspace, projectId, { name, description = '', color = '#9747FF' }) {
  const project = getProject(workspace, projectId);
  const concept = {
    id: id('cpt'),
    name: name?.trim() || 'Новая концепция',
    description,
    color,
    viewport: { x: 0, y: 0, zoom: 0.85 },
    ...emptyGraph(),
    createdAt: now(),
    updatedAt: now(),
  };
  project.concepts.push(concept);
  project.updatedAt = now();
  return concept;
}

export function updateConcept(workspace, conceptId, patch) {
  const { concept } = getConcept(workspace, conceptId);
  for (const key of ['name', 'description', 'color']) {
    if (patch[key] !== undefined) concept[key] = patch[key];
  }
  if (patch.viewport !== undefined) concept.viewport = patch.viewport;
  concept.updatedAt = now();
  return concept;
}

export function deleteConcept(workspace, conceptId) {
  const { project, concept } = getConcept(workspace, conceptId);
  project.concepts = project.concepts.filter((c) => c.id !== conceptId);
  project.updatedAt = now();
  return concept;
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

export const NODE_TYPES = ['concept', 'question', 'decision', 'task', 'risk', 'source', 'note', 'table'];
export const NODE_STATUSES = ['open', 'active', 'done', 'parked'];
export const EDGE_KINDS = ['supports', 'depends', 'refines', 'contradicts', 'relates'];
function defaultTable() {
  return {
    columns: ['Колонка 1', 'Колонка 2'],
    rows: [['', '']],
  };
}

export function normalizeTable(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  const sourceColumns = Array.isArray(raw.columns)
    ? raw.columns.slice(0, 12).map((column) => String(column).trim() || 'Колонка')
    : [];
  if (!sourceColumns.length) return undefined;
  const columns = [];
  for (const source of sourceColumns) {
    let name = source;
    let index = 2;
    while (columns.includes(name)) name = `${source} ${index++}`;
    columns.push(name);
  }
  const rows = Array.isArray(raw.rows)
    ? raw.rows
        .slice(0, 200)
        .map((row) => columns.map((_, index) => String(Array.isArray(row) ? row[index] ?? '' : '')))
    : [];
  return { columns, rows };
}

export function addNode(
  workspace,
  conceptId,
  {
    type = 'concept',
    title,
    summary = '',
    body = '',
    tags = [],
    status = 'open',
    origin = 'human',
    position,
    width,
    height,
    table,
  },
) {
  const { concept } = getConcept(workspace, conceptId);
  const nodeType = NODE_TYPES.includes(type) ? type : 'concept';
  const node = {
    id: id('nod'),
    type: nodeType,
    title: title?.trim() || 'Без названия',
    summary,
    body,
    tags,
    status: NODE_STATUSES.includes(status) ? status : 'open',
    origin,
    x: Number(position?.x) || 0,
    y: Number(position?.y) || 0,
    ...(Number(width) > 0 ? { width: Math.min(900, Math.max(220, Number(width))) } : {}),
    ...(Number(height) > 0 ? { height: Math.min(900, Math.max(110, Number(height))) } : {}),
    ...(nodeType === 'table'
      ? { table: normalizeTable(table) ?? defaultTable() }
      : table !== undefined
        ? { table: normalizeTable(table) }
        : {}),
    createdAt: now(),
    updatedAt: now(),
  };
  concept.nodes.push(node);
  concept.updatedAt = now();
  return node;
}

export function updateNode(workspace, nodeId, patch) {
  const { node, concept } = findNode(workspace, nodeId);
  if (patch.type !== undefined && NODE_TYPES.includes(patch.type)) node.type = patch.type;
  if (patch.status !== undefined && NODE_STATUSES.includes(patch.status)) node.status = patch.status;
  for (const key of ['title', 'summary', 'body']) {
    if (patch[key] !== undefined) node[key] = patch[key];
  }
  if (patch.tags !== undefined) {
    node.tags = Array.isArray(patch.tags)
      ? patch.tags.map((t) => String(t).trim()).filter(Boolean)
      : String(patch.tags)
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
  }
  if (patch.x !== undefined) node.x = Number(patch.x) || 0;
  if (patch.y !== undefined) node.y = Number(patch.y) || 0;
  if (patch.width !== undefined) {
    const width = Number(patch.width);
    if (width > 0) node.width = Math.min(900, Math.max(220, width));
  }
  if (patch.height !== undefined) {
    const height = Number(patch.height);
    if (height > 0) node.height = Math.min(900, Math.max(110, height));
  }
  if (patch.table !== undefined || (patch.type === 'table' && !node.table)) {
    node.table = normalizeTable(patch.table) ?? (node.type === 'table' ? defaultTable() : undefined);
  }
  node.updatedAt = now();
  concept.updatedAt = now();
  return node;
}

export function deleteNode(workspace, nodeId) {
  const { node, concept } = findNode(workspace, nodeId);
  concept.nodes = concept.nodes.filter((n) => n.id !== nodeId);
  const removedEdges = concept.edges.filter((e) => e.source === nodeId || e.target === nodeId);
  concept.edges = concept.edges.filter((e) => e.source !== nodeId && e.target !== nodeId);
  concept.updatedAt = now();
  return { node, removedEdges };
}

export function setNodePositions(workspace, conceptId, positions, resetLanes = false) {
  const { concept } = getConcept(workspace, conceptId);
  const byId = new Map(concept.nodes.map((n) => [n.id, n]));
  for (const item of positions) {
    const node = byId.get(item.id);
    if (node && Number.isFinite(Number(item.x)) && Number.isFinite(Number(item.y))) {
      node.x = Number(item.x);
      node.y = Number(item.y);
    }
  }
  if (resetLanes) {
    for (const edge of concept.edges) edge.lane = 0;
  }
  concept.updatedAt = now();
  return concept;
}

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------

export function addEdge(
  workspace,
  conceptId,
  { source, target, kind = 'relates', label = '', lane = 0 },
) {
  const { concept } = getConcept(workspace, conceptId);
  if (!concept.nodes.some((n) => n.id === source)) throw new NotFound(`Узел ${source} не найден в концепции`);
  if (!concept.nodes.some((n) => n.id === target)) throw new NotFound(`Узел ${target} не найден в концепции`);
  if (source === target) throw new Error('Нельзя связать узел с самим собой');
  const existing = concept.edges.find((e) => e.source === source && e.target === target);
  if (existing) {
    existing.kind = EDGE_KINDS.includes(kind) ? kind : existing.kind;
    if (label) existing.label = label;
    concept.updatedAt = now();
    return existing;
  }
  const edge = {
    id: id('edg'),
    source,
    target,
    kind: EDGE_KINDS.includes(kind) ? kind : 'relates',
    label,
    lane: Number.isFinite(Number(lane)) ? Math.max(-800, Math.min(800, Number(lane))) : 0,
    createdAt: now(),
  };
  concept.edges.push(edge);
  concept.updatedAt = now();
  return edge;
}

export function updateEdge(workspace, edgeId, patch) {
  const { edge, concept } = findEdge(workspace, edgeId);
  if (patch.kind !== undefined && EDGE_KINDS.includes(patch.kind)) edge.kind = patch.kind;
  if (patch.label !== undefined) edge.label = patch.label;
  if (patch.lane !== undefined) {
    const lane = Number(patch.lane);
    if (Number.isFinite(lane)) edge.lane = Math.max(-800, Math.min(800, Math.round(lane)));
  }
  concept.updatedAt = now();
  return edge;
}

export function deleteEdge(workspace, edgeId) {
  const { edge, concept } = findEdge(workspace, edgeId);
  concept.edges = concept.edges.filter((e) => e.id !== edgeId);
  concept.updatedAt = now();
  return edge;
}

// ---------------------------------------------------------------------------
// Secrets & providers
// ---------------------------------------------------------------------------

function readSecrets() {
  ensureHome();
  if (!fs.existsSync(SECRETS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeSecrets(secrets) {
  atomicWrite(SECRETS_FILE, JSON.stringify(secrets, null, 2));
  try {
    fs.chmodSync(SECRETS_FILE, 0o600);
  } catch {
    /* best effort */
  }
}

function cleanApiKey(raw) {
  const key = String(raw ?? '').trim();
  // Legacy bad values (for example a pasted command) must not masquerade as a
  // saved key: the UI should say "no key" and the AI should ask for one.
  return /\s/.test(key) ? '' : key;
}

export function getProviderKey(providerId) {
  return cleanApiKey(readSecrets().providers?.[providerId]?.apiKey);
}

export function setProviderKey(providerId, apiKey) {
  const secrets = readSecrets();
  secrets.providers ??= {};
  if (!apiKey) {
    delete secrets.providers[providerId];
  } else {
    secrets.providers[providerId] = { apiKey };
  }
  writeSecrets(secrets);
}

function isLocalProvider(provider) {
  try {
    const url = new URL(provider.baseUrl);
    return ['127.0.0.1', 'localhost', '0.0.0.0'].includes(url.hostname);
  } catch {
    return false;
  }
}

export function providersWithKeyState(workspace) {
  return workspace.settings.providers.map((provider) => ({
    ...provider,
    // Local endpoints (Ollama, LM Studio, vLLM) and the built-in demo need no key.
    hasKey:
      provider.kind === 'demo' ||
      Boolean(getProviderKey(provider.id)) ||
      (provider.kind === 'openai' && isLocalProvider(provider)),
  }));
}

export function publicWorkspace(workspace) {
  return {
    ...workspace,
    settings: {
      ...workspace.settings,
      providers: providersWithKeyState(workspace),
    },
  };
}
