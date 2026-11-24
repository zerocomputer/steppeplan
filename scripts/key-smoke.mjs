#!/usr/bin/env node
/**
 * Regression test for provider key saving:
 *  - reject accidental command/text pasted into the key field;
 *  - report hasKey=true in the PATCH response and workspace;
 *  - never echo the secret back.
 */
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'steppeplan-key-test-'));
const port = await new Promise((resolve) => {
  const server = net.createServer();
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    server.close(() => resolve(port));
  });
});

const child = spawn(process.execPath, [path.join(root, 'server/index.mjs')], {
  cwd: root,
  env: { ...process.env, STEPPEPLAN_HOME: home, PORT: String(port), HOST: '127.0.0.1' },
  stdio: ['ignore', 'ignore', 'inherit'],
});

const base = `http://127.0.0.1:${port}`;
async function waitReady() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return;
    } catch {
      /* not ready */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('server did not start');
}

try {
  await waitReady();
  const bad = await fetch(`${base}/api/providers/deepseek`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: 'npm run dev' }),
  });
  if (bad.status !== 400) throw new Error(`expected 400 for command text, got ${bad.status}`);
  console.log('spaces rejected: ok');

  const goodKey = 'sk-test-1234567890';
  const good = await fetch(`${base}/api/providers/deepseek`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: goodKey, model: 'deepseek-flash' }),
  });
  const text = await good.text();
  if (!good.ok) throw new Error(`expected 200, got ${good.status}: ${text}`);
  if (text.includes(goodKey)) throw new Error('API key leaked in response');
  const payload = JSON.parse(text);
  const provider = payload.workspace.settings.providers.find((item) => item.id === 'deepseek');
  if (!provider?.hasKey) throw new Error('hasKey is false after saving the key');
  console.log('hasKey after save: ok');
  console.log('secret not echoed: ok');

  const secrets = JSON.parse(fs.readFileSync(path.join(home, 'secrets.json'), 'utf8'));
  if (secrets.providers.deepseek.apiKey !== goodKey) throw new Error('key was not stored');

  // A legacy key file with a pasted command must be treated as missing.
  fs.writeFileSync(
    path.join(home, 'secrets.json'),
    JSON.stringify({ providers: { deepseek: { apiKey: 'npm run dev' } } }),
  );
  const legacy = await (await fetch(`${base}/api/workspace`)).json();
  const legacyProvider = legacy.workspace.settings.providers.find((item) => item.id === 'deepseek');
  if (legacyProvider.hasKey) throw new Error('legacy command text is still reported as a saved key');
  console.log('legacy command ignored: ok');

  console.log('\nProvider key smoke test passed.');
} finally {
  child.kill();
  fs.rmSync(home, { recursive: true, force: true });
}
