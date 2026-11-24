#!/usr/bin/env node
/**
 * SteppePlan MCP server (stdio).
 *
 * Exposes the local concept graph to AI agents: read projects, read/write nodes
 * and edges. It shares ~/.steppeplan/workspace.json with the desktop UI.
 *
 * IMPORTANT: stdout is the JSON-RPC channel — never log to stdout here.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  HOME,
  readWorkspace,
  mutate,
  getConcept,
  findNode,
  createProject,
  createConcept,
  addNode,
  updateNode,
  deleteNode,
  addEdge,
  deleteEdge,
  updateEdge,
  NODE_TYPES,
  NODE_STATUSES,
  EDGE_KINDS,
} from '../server/store.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VERSION = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version;
  } catch {
    return '0.0.0';
  }
})();

const server = new McpServer(
  { name: 'steppeplan', version: VERSION },
  {
    instructions: `SteppePlan is a local-first concept graph. A workspace contains projects; each project contains concepts; each concept is a graph of typed nodes and semantic edges.

Read the graph before writing. Use list_projects to discover IDs, then get_concept. Ground every proposal in the existing graph, avoid duplicate nodes, and connect new nodes to relevant ones. When the user asks you to think about a project, persist the useful result as nodes/edges instead of only replying in chat.

Node types: ${NODE_TYPES.join(', ')}. Edge kinds: ${EDGE_KINDS.join(', ')} (source --kind--> target).

Concepts can contain «table» nodes with columns and rows. Use read_table to convert a table into Markdown, CSV or JSON before reasoning over it.`,
  },
);

const text = (value) => ({
  content: [
    {
      type: 'text',
      text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
    },
  ],
});

const fail = (error) => ({
  content: [{ type: 'text', text: `Error: ${error.message}` }],
  isError: true,
});

function tool(name, config, handler) {
  server.registerTool(name, config, async (args) => {
    try {
      return await handler(args ?? {});
    } catch (error) {
      return fail(error);
    }
  });
}

const nodeSummary = (n) => ({
  id: n.id,
  type: n.type,
  title: n.title,
  summary: n.summary,
  status: n.status,
  tags: n.tags,
  origin: n.origin,
  position: { x: n.x, y: n.y },
  size: n.width || n.height ? { width: n.width ?? 252, height: n.height ?? null } : undefined,
  ...(n.table ? { table: n.table } : {}),
  updatedAt: n.updatedAt,
});

const edgeSummary = (e) => ({
  id: e.id,
  source: e.source,
  target: e.target,
  kind: e.kind,
  label: e.label,
  lane: e.lane ?? 0,
});

function projectSummary(project) {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    updatedAt: project.updatedAt,
    concepts: project.concepts.map((concept) => ({
      id: concept.id,
      name: concept.name,
      description: concept.description,
      nodes: concept.nodes.length,
      edges: concept.edges.length,
      updatedAt: concept.updatedAt,
    })),
  };
}

function autoPosition(concept, anchor) {
  const nodes = concept.nodes;
  const maxRight = nodes.reduce((max, n) => Math.max(max, n.x + 252), 0);
  const minTop = nodes.reduce((min, n) => Math.min(min, n.y), 0);
  const baseX = anchor ? anchor.x + 330 : maxRight + 78;
  const baseY = anchor ? anchor.y : minTop;
  const candidates = [];
  for (let row = 0; row <= 6; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      candidates.push({ x: baseX + col * 300, y: baseY + row * 160 });
    }
  }
  for (const candidate of candidates) {
    const occupied = nodes.some(
      (n) => Math.abs(n.x - candidate.x) < 280 && Math.abs(n.y - candidate.y) < 118,
    );
    if (!occupied) return { x: candidate.x, y: candidate.y };
  }
  return { x: baseX + 4 * 300, y: baseY };
}

const tableInput = z.object({
  columns: z.array(z.string().min(1)).min(1).max(12),
  rows: z.array(z.array(z.string())).max(200),
});

// ---------------------------------------------------------------------------
// Tools — reading
// ---------------------------------------------------------------------------

tool(
  'list_projects',
  {
    title: 'List projects and concepts',
    description:
      'List all projects with their concepts (IDs, names, node/edge counts). Start here to discover IDs.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => {
    const workspace = readWorkspace();
    return text({
      revision: workspace.revision,
      projects: workspace.projects.map(projectSummary),
    });
  },
);

tool(
  'get_concept',
  {
    title: 'Read a concept graph',
    description:
      'Read a full concept: nodes (with summaries, status, tags, positions) and edges. Always call this before modifying a concept.',
    inputSchema: {
      concept_id: z.string().describe('Concept ID from list_projects'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ concept_id }) => {
    const workspace = readWorkspace();
    const { project, concept } = getConcept(workspace, concept_id);
    return text({
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
      },
      concept: {
        id: concept.id,
        name: concept.name,
        description: concept.description,
        updatedAt: concept.updatedAt,
      },
      nodes: concept.nodes.map(nodeSummary),
      edges: concept.edges.map(edgeSummary),
    });
  },
);

tool(
  'get_project',
  {
    title: 'Read a project',
    description: 'Project metadata with concept summaries and a digest of every concept graph.',
    inputSchema: {
      project_id: z.string(),
      include_nodes: z.boolean().optional().default(false).describe('Include compact node lists for each concept'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ project_id, include_nodes }) => {
    const workspace = readWorkspace();
    const project = workspace.projects.find((p) => p.id === project_id);
    if (!project) throw new Error(`Project ${project_id} not found`);
    const summary = projectSummary(project);
    if (include_nodes) {
      summary.concepts = project.concepts.map((concept) => ({
        ...summary.concepts.find((c) => c.id === concept.id),
        nodes: concept.nodes.map((n) => ({ id: n.id, type: n.type, title: n.title, status: n.status })),
      }));
    }
    return text({ revision: workspace.revision, project: summary });
  },
);

tool(
  'search_nodes',
  {
    title: 'Search the graph',
    description: 'Full-text search across node titles, summaries, bodies and tags in all projects.',
    inputSchema: {
      query: z.string().min(1),
      concept_id: z.string().optional().describe('Limit to one concept'),
      limit: z.number().int().min(1).max(100).optional().default(20),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ query, concept_id, limit }) => {
    const workspace = readWorkspace();
    const needle = query.toLowerCase();
    const results = [];
    for (const project of workspace.projects) {
      for (const concept of project.concepts) {
        if (concept_id && concept.id !== concept_id) continue;
        for (const node of concept.nodes) {
          const tableText = node.table ? `${node.table.columns.join(' ')}\n${node.table.rows.flat().join(' ')}` : '';
  const haystack = `${node.title}\n${node.summary}\n${node.body}\n${node.tags.join(' ')}\n${tableText}`.toLowerCase();
          if (haystack.includes(needle)) {
            results.push({
              ...nodeSummary(node),
              project_id: project.id,
              project_name: project.name,
              concept_id: concept.id,
              concept_name: concept.name,
              body: node.body?.slice(0, 300),
            });
          }
          if (results.length >= limit) break;
        }
      }
    }
    return text({ query, count: results.length, results });
  },
);

// ---------------------------------------------------------------------------
// Tools — writing
// ---------------------------------------------------------------------------

tool(
  'create_project',
  {
    title: 'Create a project',
    description: 'Create a new project. Optionally create its first concept in the same call.',
    inputSchema: {
      name: z.string().min(1),
      description: z.string().optional().default(''),
      first_concept_name: z.string().optional(),
      first_concept_description: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  async ({ name, description, first_concept_name, first_concept_description }) => {
    const { result } = mutate('mcp', (workspace) => {
      const project = createProject(workspace, { name, description });
      let concept = null;
      if (first_concept_name) {
        concept = createConcept(workspace, project.id, {
          name: first_concept_name,
          description: first_concept_description || '',
        });
      }
      return { project: projectSummary(project), concept_id: concept?.id ?? null };
    });
    return text(result);
  },
);

tool(
  'create_concept',
  {
    title: 'Create a concept',
    description: 'Add an empty concept graph to an existing project.',
    inputSchema: {
      project_id: z.string(),
      name: z.string().min(1),
      description: z.string().optional().default(''),
      color: z.string().optional().describe('Hex color, e.g. #9747FF'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  async ({ project_id, name, description, color }) => {
    const { result } = mutate('mcp', (workspace) =>
      createConcept(workspace, project_id, { name, description, color }),
    );
    return text({
      id: result.id,
      name: result.name,
      project_id,
      viewport: result.viewport,
    });
  },
);

tool(
  'add_node',
  {
    title: 'Add a node',
    description:
      'Create a typed node in a concept. Provide a short title, a one-to-two sentence summary, and connect it to an existing node when possible.',
    inputSchema: {
      concept_id: z.string(),
      type: z.enum(NODE_TYPES).default('concept'),
      title: z.string().min(1),
      summary: z.string().optional().default(''),
      body: z.string().optional().default(''),
      tags: z.array(z.string()).optional().default([]),
      status: z.enum(NODE_STATUSES).optional().default('open'),
      connect_to_node_id: z.string().optional().describe('Existing node to link the new node to'),
      relationship: z.enum(EDGE_KINDS).optional().default('supports'),
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().min(220).max(900).optional(),
      height: z.number().min(110).max(900).optional(),
      table: tableInput.optional().describe('Table payload for type=table'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  async (args) => {
    const { result } = mutate('mcp', (workspace) => {
      const { concept } = getConcept(workspace, args.concept_id);
      const anchor = args.connect_to_node_id
        ? concept.nodes.find((n) => n.id === args.connect_to_node_id)
        : null;
      if (args.connect_to_node_id && !anchor) {
        throw new Error(`Anchor node ${args.connect_to_node_id} is not in concept ${args.concept_id}`);
      }
      const position =
        Number.isFinite(args.x) && Number.isFinite(args.y)
          ? { x: args.x, y: args.y }
          : autoPosition(concept, anchor);
      const node = addNode(workspace, args.concept_id, {
        type: args.type,
        title: args.title,
        summary: args.summary || '',
        body: args.body || '',
        tags: args.tags || [],
        status: args.status || 'open',
        origin: 'mcp',
        position,
        width: args.width,
        height: args.height,
        table: args.table,
      });
      let edge_id = null;
      if (anchor) {
        const edge = addEdge(workspace, args.concept_id, {
          source: anchor.id,
          target: node.id,
          kind: args.relationship || 'supports',
        });
        edge_id = edge.id;
      }
      return {
        node_id: node.id,
        title: node.title,
        type: node.type,
        position: { x: node.x, y: node.y },
        edge_id,
      };
    });
    return text(result);
  },
);

tool(
  'update_node',
  {
    title: 'Update a node',
    description: 'Edit an existing node by ID: title, summary, body, status, tags, or position.',
    inputSchema: {
      node_id: z.string(),
      title: z.string().optional(),
      summary: z.string().optional(),
      body: z.string().optional(),
      status: z.enum(NODE_STATUSES).optional(),
      tags: z.array(z.string()).optional(),
      x: z.number().optional(),
      y: z.number().optional(),
      width: z.number().min(220).max(900).optional(),
      height: z.number().min(110).max(900).optional(),
      table: tableInput.optional().describe('Table payload for type=table'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  async (args) => {
    const { result } = mutate('mcp', (workspace) => updateNode(workspace, args.node_id, args));
    return text({ node_id: result.id, title: result.title, status: result.status, updatedAt: result.updatedAt });
  },
);

tool(
  'read_table',
  {
    title: 'Read a table as readable data',
    description:
      'Convert a table node into Markdown, CSV or JSON for reasoning, reports and handoff.',
    inputSchema: {
      node_id: z.string(),
      format: z.enum(['markdown', 'csv', 'json']).optional().default('markdown'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ node_id, format }) => {
    const workspace = readWorkspace();
    const { node } = findNode(workspace, node_id);
    if (!node.table) throw new Error(`Node ${node_id} is not a table`);
    const { columns, rows } = node.table;
    if (format === 'json') {
      return text({ title: node.title, columns, rows });
    }
    if (format === 'csv') {
      const quote = (value) => {
        const cell = String(value ?? '');
        return /["\n,]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
      };
      const csv = [columns, ...rows].map((row) => row.map(quote).join(',')).join('\n');
      return text(`${node.title}\n${csv}`);
    }
    const escape = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    const lines = [
      `### ${node.title}`,
      '',
      `| ${columns.map(escape).join(' | ')} |`,
      `| ${columns.map(() => '---').join(' | ')} |`,
      ...rows.map((row) => `| ${columns.map((_, index) => escape(row[index])).join(' | ')} |`),
    ];
    return text(lines.join('\n'));
  },
);

tool(
  'delete_node',
  {
    title: 'Delete a node',
    description: 'Delete a node and every edge attached to it. Use only when explicitly requested.',
    inputSchema: { node_id: z.string() },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  },
  async ({ node_id }) => {
    const { result } = mutate('mcp', (workspace) => deleteNode(workspace, node_id));
    return text({
      deleted_node_id: result.node.id,
      deleted_title: result.node.title,
      removed_edges: result.removedEdges.length,
    });
  },
);

tool(
  'add_edge',
  {
    title: 'Connect two nodes',
    description:
      'Create a semantic edge inside one concept. Kinds: supports, depends, refines, contradicts, relates. Concept is derived from the source node unless concept_id is given.',
    inputSchema: {
      source_node_id: z.string(),
      target_node_id: z.string(),
      kind: z.enum(EDGE_KINDS).default('relates'),
      label: z.string().optional().default(''),
      concept_id: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  async ({ source_node_id, target_node_id, kind, label, concept_id }) => {
    const { result } = mutate('mcp', (workspace) => {
      const found = findNode(workspace, source_node_id);
      const target = findNode(workspace, target_node_id);
      if (found.concept.id !== target.concept.id) {
        throw new Error('Both nodes must belong to the same concept');
      }
      if (concept_id && concept_id !== found.concept.id) {
        throw new Error(`Source node belongs to concept ${found.concept.id}, not ${concept_id}`);
      }
      return addEdge(workspace, found.concept.id, {
        source: source_node_id,
        target: target_node_id,
        kind,
        label,
      });
    });
    return text({ edge_id: result.id, source: result.source, target: result.target, kind: result.kind });
  },
);

tool(
  'update_edge',
  {
    title: 'Update an edge',
    description: 'Change the kind or label of an existing edge.',
    inputSchema: {
      edge_id: z.string(),
      kind: z.enum(EDGE_KINDS).optional(),
      label: z.string().optional(),
      lane: z.number().min(-800).max(800).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  async ({ edge_id, kind, label, lane }) => {
    const { result } = mutate('mcp', (workspace) => updateEdge(workspace, edge_id, { kind, label, lane }));
    return text({ edge_id: result.id, kind: result.kind, label: result.label });
  },
);

tool(
  'delete_edge',
  {
    title: 'Delete an edge',
    description: 'Remove a semantic edge between two nodes.',
    inputSchema: { edge_id: z.string() },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  },
  async ({ edge_id }) => {
    const { result } = mutate('mcp', (workspace) => deleteEdge(workspace, edge_id));
    return text({ deleted_edge_id: result.id });
  },
);

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

server.registerResource(
  'workspace',
  'steppeplan://workspace',
  {
    title: 'SteppePlan workspace',
    description: 'All projects and concepts with IDs and graph sizes.',
    mimeType: 'application/json',
  },
  async (uri) => {
    const workspace = readWorkspace();
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(
            { revision: workspace.revision, projects: workspace.projects.map(projectSummary) },
            null,
            2,
          ),
        },
      ],
    };
  },
);

server.registerResource(
  'concept',
  new ResourceTemplate('steppeplan://concept/{conceptId}', {
    list: async () => {
      const workspace = readWorkspace();
      const resources = [];
      for (const project of workspace.projects) {
        for (const concept of project.concepts) {
          resources.push({
            uri: `steppeplan://concept/${concept.id}`,
            name: `${project.name} / ${concept.name}`,
            description: `${concept.nodes.length} nodes, ${concept.edges.length} edges`,
            mimeType: 'application/json',
          });
        }
      }
      return { resources };
    },
    complete: {
      conceptId: () => {
        const workspace = readWorkspace();
        return workspace.projects.flatMap((p) => p.concepts.map((c) => c.id));
      },
    },
  }),
  {
    title: 'Concept graph',
    description: 'Full node/edge graph of one concept.',
    mimeType: 'application/json',
  },
  async (uri, { conceptId }) => {
    const workspace = readWorkspace();
    const { project, concept } = getConcept(workspace, String(conceptId));
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              project: {
                id: project.id,
                name: project.name,
                description: project.description,
              },
              concept: { id: concept.id, name: concept.name, description: concept.description },
              nodes: concept.nodes.map(nodeSummary),
              edges: concept.edges.map(edgeSummary),
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[steppeplan-mcp] ready · ${HOME}/workspace.json`);
