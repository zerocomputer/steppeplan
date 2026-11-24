#!/usr/bin/env node
/**
 * Append a note to SteppePlan through the real MCP protocol.
 *
 *   npm run mcp:note -- \
 *     --title "Решение: …" \
 *     --summary "Что и почему" \
 *     --type decision \
 *     --tags task_001,решение \
 *     --connect-title "Итерация 2026-11-24"
 *
 * Defaults: project "SteppePlan", concept "Разработка" (created on demand).
 * Never put API keys or other secrets in notes.
 */
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const argv = process.argv.slice(2);
const args = {};
for (let i = 0; i < argv.length; i += 1) {
  const key = argv[i];
  if (key.startsWith('--')) args[key.slice(2)] = argv[i + 1] ?? '';
}

const title = args.title?.trim();
if (!title) {
  console.error('Укажите --title "…"');
  process.exit(2);
}

const projectName = args.project?.trim() || 'SteppePlan';
const conceptName = args.concept?.trim() || 'Разработка';
const root = path.resolve(import.meta.dirname, '..');
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(root, 'mcp/server.mjs')],
  env: { ...process.env },
  stderr: 'pipe',
});
const client = new Client({ name: 'mcp-note', version: '0.1.0' });
const text = (result) => JSON.parse(result.content.find((item) => item.type === 'text').text);

try {
  await client.connect(transport);
  const projects = text(await client.callTool({ name: 'list_projects', arguments: {} }));
  let project = projects.projects.find((item) => item.name === projectName);
  if (!project) throw new Error(`Проект «${projectName}» не найден`);

  let concept = project.concepts.find((item) => item.name === conceptName);
  if (!concept) {
    const created = text(
      await client.callTool({
        name: 'create_concept',
        arguments: {
          project_id: project.id,
          name: conceptName,
          description: 'Журнал решений и знаний, которые агенты фиксируют через MCP.',
          color: '#0D99FF',
        },
      }),
    );
    concept = { id: created.id, name: created.name };
    console.log(`concept created: ${created.id}`);
  }

  const graph = text(
    await client.callTool({ name: 'get_concept', arguments: { concept_id: concept.id } }),
  );
  const anchor = args['connect-title']
    ? graph.nodes.find((node) => node.title === args['connect-title'])
    : null;
  if (args['connect-title'] && !anchor) {
    throw new Error(`Узел «${args['connect-title']}» не найден в концепции «${conceptName}»`);
  }

  const created = text(
    await client.callTool({
      name: 'add_node',
      arguments: {
        concept_id: concept.id,
        type: args.type || 'note',
        title,
        summary: args.summary || '',
        body: args.body || '',
        tags: (args.tags || 'task_001,журнал').split(',').map((tag) => tag.trim()).filter(Boolean),
        status: args.status || 'done',
        connect_to_node_id: anchor?.id,
        relationship: args.relationship || 'refines',
      },
    }),
  );
  console.log(
    JSON.stringify({ project: projectName, concept: conceptName, node_id: created.node_id, title }, null, 2),
  );
} finally {
  await client.close().catch(() => {});
}
