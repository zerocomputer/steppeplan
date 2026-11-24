#!/usr/bin/env node
/**
 * AI smoke test: exercises the real provider tool-loop for both supported
 * wire formats (OpenAI-compatible and Anthropic) against a local mock server.
 * Uses a throwaway STEPPEPLAN_HOME, so it never touches real data or network.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'steppeplan-ai-test-'));
process.env.STEPPEPLAN_HOME = home;

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        resolve({});
      }
    });
  });
}

const mock = http.createServer(async (req, res) => {
  const body = req.method === 'POST' ? await readBody(req) : {};
  const send = (data) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  if (req.method === 'GET' && req.url?.endsWith('/models')) {
    return send({ data: [{ id: 'mock-model' }] });
  }

  if (req.url === '/v1/chat/completions') {
    const hasTool = (body.messages || []).some((message) => message.role === 'tool');
    if (!hasTool) {
      return send({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Фиксирую.',
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'create_node',
                    arguments: JSON.stringify({
                      type: 'task',
                      title: 'Смоук OpenAI',
                      summary: 'Создано мок-моделью через OpenAI tool calling.',
                    }),
                  },
                },
              ],
            },
          },
        ],
      });
    }
    return send({
      choices: [{ message: { role: 'assistant', content: 'OpenAI-совместимый tool-loop работает.' } }],
    });
  }

  if (req.url === '/anthropic/v1/messages') {
    const hasToolResult = (body.messages || []).some(
      (message) =>
        Array.isArray(message.content) && message.content.some((block) => block.type === 'tool_result'),
    );
    if (!hasToolResult) {
      return send({
        content: [
          { type: 'text', text: 'Фиксирую.' },
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'create_node',
            input: {
              type: 'source',
              title: 'Смоук Anthropic',
              summary: 'Создано мок-моделью через tool_use / tool_result.',
            },
          },
        ],
      });
    }
    return send({
      content: [{ type: 'text', text: 'Anthropic tool-loop работает.' }],
    });
  }

  res.writeHead(404);
  res.end('{}');
});

await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve));
const port = mock.address().port;

const store = await import('../server/store.mjs');
const { runAssistant } = await import('../server/ai.mjs');

const workspace = store.readWorkspace();
const conceptId = workspace.projects[0].concepts[0].id;

store.mutate('test', (ws) => {
  ws.settings.providers.push(
    {
      id: 'mock-openai',
      name: 'Mock OpenAI',
      kind: 'openai',
      baseUrl: `http://127.0.0.1:${port}/v1`,
      model: 'mock-model',
    },
    {
      id: 'mock-anthropic',
      name: 'Mock Anthropic',
      kind: 'anthropic',
      baseUrl: `http://127.0.0.1:${port}/anthropic/v1`,
      model: 'mock-claude',
    },
  );
});

try {
  store.mutate('test', (ws) => {
    ws.settings.activeProviderId = 'mock-openai';
  });
  const openai = await runAssistant({
    conceptId,
    messages: [{ role: 'user', content: 'Добавь задачу' }],
    selection: [],
  });
  if (!openai.reply.includes('OpenAI')) throw new Error(`Unexpected OpenAI reply: ${openai.reply}`);
  if (!openai.actions.some((action) => action.kind === 'node_created')) {
    throw new Error('OpenAI tool call was not executed');
  }
  const afterOpenAi = store.readWorkspace();
  const conceptOpenAi = store.getConcept(afterOpenAi, conceptId).concept;
  if (!conceptOpenAi.nodes.some((node) => node.title === 'Смоук OpenAI')) {
    throw new Error('OpenAI node was not persisted');
  }
  console.log(`openai: ok · actions=${openai.actions.length}`);

  store.mutate('test', (ws) => {
    ws.settings.activeProviderId = 'mock-anthropic';
  });
  const anthropic = await runAssistant({
    conceptId,
    messages: [{ role: 'user', content: 'Добавь источник' }],
    selection: [],
  });
  if (!anthropic.reply.includes('Anthropic')) throw new Error(`Unexpected Anthropic reply: ${anthropic.reply}`);
  if (!anthropic.actions.some((action) => action.kind === 'node_created')) {
    throw new Error('Anthropic tool call was not executed');
  }
  const afterAnthropic = store.readWorkspace();
  const conceptAnthropic = store.getConcept(afterAnthropic, conceptId).concept;
  if (!conceptAnthropic.nodes.some((node) => node.title === 'Смоук Anthropic')) {
    throw new Error('Anthropic node was not persisted');
  }
  console.log(`anthropic: ok · actions=${anthropic.actions.length}`);
  console.log('\nAI smoke test passed.');
} finally {
  mock.close();
  fs.rmSync(home, { recursive: true, force: true });
}
