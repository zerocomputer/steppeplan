import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HOME,
  DATA_FILE,
  events,
  readWorkspace,
  mutate,
  publicWorkspace,
  getProviderKey,
  setProviderKey,
  NotFound,
  createProject,
  updateProject,
  deleteProject,
  createConcept,
  updateConcept,
  deleteConcept,
  addNode,
  updateNode,
  deleteNode,
  addEdge,
  updateEdge,
  deleteEdge,
  setNodePositions,
} from './store.mjs';
import { runAssistant, testProvider, HttpError } from './ai.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const MCP_ENTRY = path.join(ROOT, 'mcp', 'server.mjs');
const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || '127.0.0.1';
const APP_VERSION = (() => {
  if (process.env.STEPPEPLAN_APP_VERSION) return process.env.STEPPEPLAN_APP_VERSION;
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  } catch {
    return '0.0.0';
  }
})();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 2_000_000) {
        reject(new HttpError(413, 'Слишком большой запрос'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'Некорректный JSON в теле запроса'));
      }
    });
    req.on('error', reject);
  });
}

function withWorkspace(result) {
  return {
    workspace: publicWorkspace(result.workspace),
    revision: result.workspace.revision,
    entity: result.result ?? null,
  };
}

// ---------------------------------------------------------------------------
// SSE
// ---------------------------------------------------------------------------

const sseClients = new Set();
let lastBroadcastRevision = -1;
let broadcastTimer = null;

function broadcast(revision, source) {
  if (revision === lastBroadcastRevision) return;
  lastBroadcastRevision = revision;
  const payload = `event: change\ndata: ${JSON.stringify({ revision, source })}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

events.on('change', ({ revision, source }) => broadcast(revision, source));

function watchWorkspace() {
  try {
    const watcher = fs.watch(HOME, (event, filename) => {
      if (!filename || !String(filename).startsWith('workspace.json')) return;
      if (broadcastTimer) clearTimeout(broadcastTimer);
      broadcastTimer = setTimeout(() => {
        try {
          const workspace = readWorkspace();
          broadcast(workspace.revision, 'mcp');
        } catch (error) {
          console.error('[watch]', error.message);
        }
      }, 120);
    });
    watcher.on('error', (error) => console.error('[watch]', error.message));
    return watcher;
  } catch (error) {
    console.error('[watch]', error.message);
    return null;
  }
}

setInterval(() => {
  for (const client of sseClients) {
    try {
      client.write(': keepalive\n\n');
    } catch {
      sseClients.delete(client);
    }
  }
}, 20_000).unref();

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

async function handleApi(req, res, url) {
  const method = req.method || 'GET';
  const pathname = url.pathname;

  if (method === 'GET' && pathname === '/api/health') {
    return sendJson(res, 200, { ok: true, revision: readWorkspace().revision });
  }

  if (method === 'GET' && pathname === '/api/info') {
    const workspace = readWorkspace();
    const nodeCommand = process.env.STEPPEPLAN_NODE_BIN || 'node';
    return sendJson(res, 200, {
      version: APP_VERSION,
      desktop: process.env.STEPPEPLAN_DESKTOP === '1',
      home: HOME,
      dataFile: DATA_FILE,
      projects: workspace.projects.length,
      revision: workspace.revision,
      mcp: {
        command: nodeCommand,
        args: [MCP_ENTRY],
        config: {
          $schema: 'https://opencode.ai/config.json',
          mcp: {
            servers: {
              steppeplan: {
                type: 'local',
                command: [nodeCommand, MCP_ENTRY],
              },
            },
          },
        },
      },
    });
  }

  if (method === 'GET' && pathname === '/api/workspace') {
    return sendJson(res, 200, { workspace: publicWorkspace(readWorkspace()) });
  }

  if (method === 'GET' && pathname === '/api/export') {
    const workspace = readWorkspace();
    const body = JSON.stringify(workspace, null, 2);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="steppeplan-workspace.json"',
      'Content-Length': Buffer.byteLength(body),
    });
    return res.end(body);
  }

  if (method === 'GET' && pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(`retry: 2000\n\n`);
    res.write(`event: hello\ndata: ${JSON.stringify({ revision: readWorkspace().revision })}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // --- Projects ------------------------------------------------------------
  if (method === 'POST' && pathname === '/api/projects') {
    const body = await readBody(req);
    return sendJson(res, 201, withWorkspace(mutate('ui', (ws) => createProject(ws, body))));
  }

  let match = pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (match) {
    const projectId = decodeURIComponent(match[1]);
    if (method === 'PATCH') {
      const body = await readBody(req);
      return sendJson(res, 200, withWorkspace(mutate('ui', (ws) => updateProject(ws, projectId, body))));
    }
    if (method === 'DELETE') {
      return sendJson(res, 200, withWorkspace(mutate('ui', (ws) => deleteProject(ws, projectId))));
    }
  }

  match = pathname.match(/^\/api\/projects\/([^/]+)\/concepts$/);
  if (match && method === 'POST') {
    const body = await readBody(req);
    const projectId = decodeURIComponent(match[1]);
    return sendJson(
      res,
      201,
      withWorkspace(mutate('ui', (ws) => createConcept(ws, projectId, body))),
    );
  }

  // --- Concepts ------------------------------------------------------------
  match = pathname.match(/^\/api\/concepts\/([^/]+)$/);
  if (match) {
    const conceptId = decodeURIComponent(match[1]);
    if (method === 'PATCH') {
      const body = await readBody(req);
      return sendJson(res, 200, withWorkspace(mutate('ui', (ws) => updateConcept(ws, conceptId, body))));
    }
    if (method === 'DELETE') {
      return sendJson(res, 200, withWorkspace(mutate('ui', (ws) => deleteConcept(ws, conceptId))));
    }
  }

  match = pathname.match(/^\/api\/concepts\/([^/]+)\/nodes$/);
  if (match && method === 'POST') {
    const body = await readBody(req);
    const conceptId = decodeURIComponent(match[1]);
    return sendJson(
      res,
      201,
      withWorkspace(mutate('ui', (ws) => addNode(ws, conceptId, body))),
    );
  }

  match = pathname.match(/^\/api\/concepts\/([^/]+)\/positions$/);
  if (match && method === 'PATCH') {
    const body = await readBody(req);
    const conceptId = decodeURIComponent(match[1]);
    return sendJson(
      res,
      200,
      withWorkspace(
        mutate('ui', (ws) =>
          setNodePositions(ws, conceptId, body.positions || [], Boolean(body.resetLanes)),
        ),
      ),
    );
  }

  match = pathname.match(/^\/api\/concepts\/([^/]+)\/edges$/);
  if (match && method === 'POST') {
    const body = await readBody(req);
    const conceptId = decodeURIComponent(match[1]);
    return sendJson(
      res,
      201,
      withWorkspace(mutate('ui', (ws) => addEdge(ws, conceptId, body))),
    );
  }

  // --- Nodes ---------------------------------------------------------------
  match = pathname.match(/^\/api\/nodes\/([^/]+)$/);
  if (match) {
    const nodeId = decodeURIComponent(match[1]);
    if (method === 'PATCH') {
      const body = await readBody(req);
      return sendJson(res, 200, withWorkspace(mutate('ui', (ws) => updateNode(ws, nodeId, body))));
    }
    if (method === 'DELETE') {
      return sendJson(res, 200, withWorkspace(mutate('ui', (ws) => deleteNode(ws, nodeId))));
    }
  }

  // --- Edges ---------------------------------------------------------------
  match = pathname.match(/^\/api\/edges\/([^/]+)$/);
  if (match) {
    const edgeId = decodeURIComponent(match[1]);
    if (method === 'PATCH') {
      const body = await readBody(req);
      return sendJson(res, 200, withWorkspace(mutate('ui', (ws) => updateEdge(ws, edgeId, body))));
    }
    if (method === 'DELETE') {
      return sendJson(res, 200, withWorkspace(mutate('ui', (ws) => deleteEdge(ws, edgeId))));
    }
  }

  // --- Settings & providers ------------------------------------------------
  if (method === 'PATCH' && pathname === '/api/settings') {
    const body = await readBody(req);
    return sendJson(
      res,
      200,
      withWorkspace(
        mutate('ui', (ws) => {
          if (body.activeProviderId !== undefined) {
            const exists = ws.settings.providers.some((p) => p.id === body.activeProviderId);
            if (!exists) throw new NotFound('Провайдер не найден');
            ws.settings.activeProviderId = body.activeProviderId;
          }
        }),
      ),
    );
  }

  match = pathname.match(/^\/api\/providers\/([^/]+)$/);
  if (match && method === 'PATCH') {
    const providerId = decodeURIComponent(match[1]);
    const body = await readBody(req);
    const existing = readWorkspace().settings.providers.find((p) => p.id === providerId);
    if (!existing) throw new NotFound('Провайдер не найден');

    // Write the secret before the workspace mutation: the response and the SSE
    // refresh must already report hasKey=true, otherwise the UI looks like the
    // key was not saved while the AI request still uses the new key.
    const hasApiKey = Object.prototype.hasOwnProperty.call(body, 'apiKey');
    if (hasApiKey) {
      const rawKey = String(body.apiKey ?? '').trim();
      if (rawKey && (/\s/.test(rawKey) || rawKey.length > 512)) {
        throw new HttpError(
          400,
          'API-ключ не должен содержать пробелы или переносы строк. Похоже, вставлен текст или команда вместо ключа.',
        );
      }
      setProviderKey(providerId, rawKey);
    }

    const result = mutate('ui', (ws) => {
      const provider = ws.settings.providers.find((p) => p.id === providerId);
      if (!provider) throw new NotFound('Провайдер не найден');
      for (const key of ['name', 'baseUrl', 'model']) {
        if (body[key] !== undefined) provider[key] = String(body[key]);
      }
      if (body.kind !== undefined && ['demo', 'openai', 'anthropic'].includes(body.kind)) {
        provider.kind = body.kind;
      }
      return provider;
    });
    return sendJson(res, 200, withWorkspace(result));
  }

  match = pathname.match(/^\/api\/providers\/([^/]+)\/test$/);
  if (match && method === 'POST') {
    const providerId = decodeURIComponent(match[1]);
    const workspace = readWorkspace();
    const provider = workspace.settings.providers.find((p) => p.id === providerId);
    if (!provider) throw new NotFound('Провайдер не найден');
    const isLocalEndpoint = /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?/i.test(
      provider.baseUrl || '',
    );
    if (!getProviderKey(providerId) && provider.kind !== 'demo' && !isLocalEndpoint) {
      return sendJson(res, 200, { ok: false, message: 'Ключ не задан — сохраните его перед проверкой.' });
    }
    const result = await testProvider(provider);
    return sendJson(res, 200, result);
  }

  // --- AI ------------------------------------------------------------------
  if (method === 'POST' && pathname === '/api/ai/chat') {
    const body = await readBody(req);
    if (!body.conceptId) throw new HttpError(400, 'Не указана концепция');
    if (!Array.isArray(body.messages)) throw new HttpError(400, 'messages должен быть массивом');
    const result = await runAssistant({
      conceptId: body.conceptId,
      messages: body.messages.slice(-20),
      selection: Array.isArray(body.selection) ? body.selection : [],
    });
    const workspace = readWorkspace();
    return sendJson(res, 200, { ...result, workspace: publicWorkspace(workspace) });
  }

  throw new HttpError(404, 'Маршрут не найден');
}

// ---------------------------------------------------------------------------
// Static files
// ---------------------------------------------------------------------------

function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(DIST, safePath);
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    // SPA fallback
    filePath = path.join(DIST, 'index.html');
  }
  if (!fs.existsSync(filePath)) {
    res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(
      `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;background:#111;color:#eee;padding:40px;line-height:1.6">
      <h1>SteppePlan API работает</h1>
      <p>Интерфейс ещё не собран. Запустите <code>npm start</code> (сборка + сервер) или <code>npm run dev</code> для разработки.</p>
      <p>API: <a style="color:#0D99FF" href="/api/workspace">/api/workspace</a></p></body>`,
    );
  }
  const ext = path.extname(filePath).toLowerCase();
  const stat = fs.statSync(filePath);
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=3600',
  });
  fs.createReadStream(filePath).pipe(res);
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  // Same-origin by default. Vite dev runs on :5173 and proxies /api, so CORS
  // is only needed for that local dev origin — never expose this API broadly.
  const origin = req.headers.origin;
  if (origin && /^http:\/\/(127\.0\.0\.1|localhost):5173$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }
  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
    } else {
      serveStatic(req, res, url);
    }
  } catch (error) {
    if (res.headersSent) {
      res.end();
      return;
    }
    const status = error instanceof HttpError ? error.status : error instanceof NotFound ? 404 : 500;
    if (status >= 500) console.error('[api]', error);
    sendJson(res, status, { error: error.message || 'Внутренняя ошибка' });
  }
});

readWorkspace(); // seed / validate before serving
lastBroadcastRevision = readWorkspace().revision;
watchWorkspace();

// Desktop shell safeguard: if the Tauri process dies without running its exit
// handler, the server gets reparented to init and should not stay orphaned.
if (process.env.STEPPEPLAN_DESKTOP === '1') {
  const parentPid = process.ppid;
  setInterval(() => {
    if (process.ppid !== parentPid) process.exit(0);
  }, 3000).unref();
}

server.listen(PORT, HOST, () => {
  console.log(`\n  SteppePlan  ·  http://${HOST}:${PORT}`);
  console.log(`  Данные:     ${DATA_FILE}`);
  console.log(`  MCP:        node ${MCP_ENTRY}\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 500).unref();
  });
}
