#!/usr/bin/env node
/**
 * SteppePlan updater for the portable Linux build.
 *
 *   steppeplan-update --manifest https://example.com/steppeplan/latest.json
 *   steppeplan-update --manifest ... --check
 *   steppeplan-update --manifest ... --yes
 *
 * Manifest format:
 * {
 *   "version": "0.2.0",
 *   "channel": "stable",
 *   "notes": "…",
 *   "artifacts": {
 *     "linux-x86_64": {
 *       "url": "https://…/steppeplan-0.2.0-linux-x86_64.tar.gz",
 *       "sha256": "…"
 *     }
 *   }
 * }
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const scriptDir = path.dirname(fs.realpathSync(process.argv[1]));
const appDir = path.resolve(scriptDir, '..');
const installDir = path.resolve(appDir, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'));
const currentVersion = pkg.version || '0.0.0';

const args = process.argv.slice(2);
const has = (name) => args.includes(name);
const value = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

if (has('--help') || has('-h')) {
  console.log(`SteppePlan updater

  --manifest URL   URL манифеста latest.json (или env STEPPEPLAN_UPDATE_MANIFEST)
  --check          Только проверить наличие обновления
  --yes            Установить без подтверждения
  --help

Текущая версия: ${currentVersion}
Установлено в:  ${installDir}
`);
  process.exit(0);
}

function compareVersions(a, b) {
  const parse = (version) => version.replace(/^v/, '').split(/[.+-]/).slice(0, 3).map((part) => Number(part) || 0);
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < 3; i += 1) {
    if (left[i] > right[i]) return 1;
    if (left[i] < right[i]) return -1;
  }
  return 0;
}

function readConfigManifest() {
  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  const file = path.join(configHome, 'steppeplan', 'update.json');
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')).manifest;
  } catch {
    return undefined;
  }
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

async function download(url, destination) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Не удалось скачать обновление: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destination, buffer);
}

const manifestUrl = value('--manifest') || process.env.STEPPEPLAN_UPDATE_MANIFEST || readConfigManifest();
if (!manifestUrl) {
  console.error('Не задан манифест обновлений. Укажите --manifest URL или настройте ~/.config/steppeplan/update.json');
  process.exit(2);
}

const response = await fetch(manifestUrl);
if (!response.ok) {
  console.error(`Манифест недоступен: HTTP ${response.status}`);
  process.exit(1);
}
const manifest = await response.json();
const latest = manifest.version;
if (!latest) {
  console.error('В манифесте нет поля version.');
  process.exit(1);
}

console.log(`Текущая версия: ${currentVersion}`);
console.log(`Доступная:     ${latest}${manifest.channel ? ` (${manifest.channel})` : ''}`);
if (compareVersions(latest, currentVersion) <= 0) {
  console.log('Обновлений нет.');
  process.exit(0);
}
if (manifest.notes) console.log(`\n${manifest.notes}\n`);
if (has('--check')) {
  process.exit(0);
}

const artifact = manifest.artifacts?.['linux-x86_64'] ?? manifest.artifacts?.['linux-x64'];
if (!artifact?.url) {
  console.error('В манифесте нет артефакта linux-x86_64.');
  process.exit(1);
}
const artifactUrl = new URL(artifact.url, manifestUrl).toString();

if (!has('--yes')) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const answer = (await rl.question('Установить обновление? [y/N] ')).trim().toLowerCase();
  rl.close();
  if (answer !== 'y' && answer !== 'yes' && answer !== 'д') {
    console.log('Отменено.');
    process.exit(0);
  }
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'steppeplan-update-'));
try {
  const archive = path.join(tempDir, 'steppeplan.tar.gz');
  console.log(`Скачиваю ${artifactUrl}`);
  await download(artifactUrl, archive);
  if (artifact.sha256) {
    const actual = sha256(archive);
    if (actual !== artifact.sha256) {
      throw new Error(`Контрольная сумма не совпала.\nожидалось: ${artifact.sha256}\nполучено:  ${actual}`);
    }
    console.log('SHA-256: ok');
  } else {
    throw new Error('В манифесте нет sha256 — обновление отклонено.');
  }

  const extractDir = path.join(tempDir, 'unpacked');
  fs.mkdirSync(extractDir);
  const tar = spawnSync('tar', ['-xzf', archive, '-C', extractDir], { stdio: 'inherit' });
  if (tar.status !== 0) throw new Error('Не удалось распаковать архив.');

  const top = fs.readdirSync(extractDir).find((entry) => fs.statSync(path.join(extractDir, entry)).isDirectory());
  if (!top) throw new Error('Пустой архив обновления.');
  const installer = path.join(extractDir, top, 'install.sh');
  if (!fs.existsSync(installer)) throw new Error('В архиве нет install.sh.');

  console.log('Устанавливаю…');
  const install = spawnSync('bash', [installer, '--update'], { stdio: 'inherit' });
  if (install.status !== 0) throw new Error('Установщик завершился с ошибкой.');
  console.log('\nГотово. Перезапустите SteppePlan.');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
