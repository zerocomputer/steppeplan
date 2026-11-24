#!/usr/bin/env node
/**
 * MCP smoke test: runs the real stdio server against a temporary workspace,
 * exercises read/write tools and a resource, and cleans up.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'steppeplan-mcp-test-'));
const env = { ...process.env, STEPPEPLAN_HOME: home };

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(ROOT, 'mcp', 'server.mjs')],
  env,
  stderr: 'pipe',
});

const client = new Client({ name: 'steppeplan-smoke', version: '0.1.0' });

function parse(result) {
  const text = result.content?.find((item) => item.type === 'text')?.text ?? '';
  return JSON.parse(text);
}

try {
  await client.connect(transport);
  const tools = await client.listTools();
  console.log(`tools: ${tools.tools.length}`);
  const names = tools.tools.map((tool) => tool.name);
  for (const expected of ['list_projects', 'get_concept', 'add_node', 'add_edge', 'search_nodes', 'read_table']) {
    if (!names.includes(expected)) throw new Error(`missing tool ${expected}`);
  }

  const projects = parse(await client.callTool({ name: 'list_projects', arguments: {} }));
  if (!projects.projects.length) throw new Error('seed workspace is empty');
  const conceptId = projects.projects[0].concepts[0].id;
  console.log(`workspace: ${projects.projects.length} projects, concept ${conceptId}`);

  const graph = parse(await client.callTool({ name: 'get_concept', arguments: { concept_id: conceptId } }));
  const anchor = graph.nodes[0];
  console.log(`concept: "${graph.concept.name}", ${graph.nodes.length} nodes, ${graph.edges.length} edges`);

  const created = parse(
    await client.callTool({
      name: 'add_node',
      arguments: {
        concept_id: conceptId,
        type: 'task',
        title: 'Проверка MCP-моста',
        summary: 'Узел, созданный smoke-тестом через MCP.',
        tags: ['test'],
        connect_to_node_id: anchor.id,
        relationship: 'relates',
      },
    }),
  );
  console.log(`created node: ${created.node_id} (edge ${created.edge_id})`);

  const search = parse(
    await client.callTool({ name: 'search_nodes', arguments: { query: 'smoke-тестом' } }),
  );
  if (search.count !== 1) throw new Error(`search returned ${search.count} results`);

  const table = parse(
    await client.callTool({
      name: 'add_node',
      arguments: {
        concept_id: conceptId,
        type: 'table',
        title: 'Смоук-таблица',
        table: {
          columns: ['Критерий', 'Значение'],
          rows: [
            ['Скорость', 'высокая'],
            ['Риск', 'низкий'],
          ],
        },
      },
    }),
  );
  const readable = await client.callTool({
    name: 'read_table',
    arguments: { node_id: table.node_id, format: 'markdown' },
  });
  const markdown = readable.content.find((item) => item.type === 'text')?.text ?? '';
  if (!markdown.includes('| Критерий | Значение |') || !markdown.includes('Скорость')) {
    throw new Error('read_table did not return readable markdown');
  }
  await client.callTool({ name: 'delete_node', arguments: { node_id: table.node_id } });

  const resource = await client.readResource({ uri: 'steppeplan://workspace' });
  const payload = JSON.parse(resource.contents[0].text);
  if (!payload.projects.length) throw new Error('workspace resource is empty');

  await client.callTool({ name: 'delete_node', arguments: { node_id: created.node_id } });

  const after = parse(await client.callTool({ name: 'get_concept', arguments: { concept_id: conceptId } }));
  if (after.nodes.some((node) => node.id === created.node_id)) throw new Error('node was not deleted');
  console.log('resources: ok');
  console.log('\nMCP smoke test passed.');
} finally {
  await client.close().catch(() => {});
  fs.rmSync(home, { recursive: true, force: true });
}
