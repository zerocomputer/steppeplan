#!/usr/bin/env node
/**
 * Build a portable Linux desktop package:
 *  - Vite UI build
 *  - Tauri shell (Rust, no bundler)
 *  - bundled Node runtime + lean server dependencies
 *  - installer, desktop entry, MCP wrapper, updater
 *  - release tarball + SHA256 + latest.json
 *
 * Usage: npm run package:linux
 *        node scripts/package-linux.mjs --skip-tauri --skip-ui
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const cargoBin = path.join(process.env.HOME || '', '.cargo', 'bin');
if (fs.existsSync(cargoBin)) process.env.PATH = `${cargoBin}:${process.env.PATH}`;
const args = process.argv.slice(2);
const skipTauri = args.includes('--skip-tauri');
const skipUi = args.includes('--skip-ui');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const arch = process.arch === 'x64' ? 'x86_64' : process.arch;
const stageName = `steppeplan-${version}-linux-${arch}`;
const releaseDir = path.join(root, 'release');
const stage = path.join(releaseDir, stageName);
const tarName = `${stageName}.tar.gz`;
const tarPath = path.join(releaseDir, tarName);

function run(command, commandArgs, options = {}) {
  console.log(`\n$ ${command} ${commandArgs.join(' ')}`);
  execFileSync(command, commandArgs, { cwd: root, stdio: 'inherit', ...options });
}

function copy(source, destination) {
  fs.cpSync(source, destination, { recursive: true });
}

function syncVersion() {
  const files = [
    [path.join(root, 'desktop/package.json'), /"version":\s*"[^"]+"/, `"version": "${version}"`],
    [path.join(root, 'desktop/src-tauri/tauri.conf.json'), /"version":\s*"[^"]+"/, `"version": "${version}"`],
    [path.join(root, 'desktop/src-tauri/Cargo.toml'), /^version = "[^"]+"/m, `version = "${version}"`],
  ];
  for (const [file, pattern, replacement] of files) {
    const before = fs.readFileSync(file, 'utf8');
    const after = before.replace(pattern, replacement);
    if (before !== after) fs.writeFileSync(file, after);
  }
}

syncVersion();

if (!skipUi) run('npm', ['run', 'build']);

if (!skipTauri) {
  if (!fs.existsSync(path.join(root, 'desktop/node_modules'))) {
    run('npm', ['install', '--no-audit', '--no-fund'], { cwd: path.join(root, 'desktop') });
  }
  run('npm', ['run', 'build'], { cwd: path.join(root, 'desktop') });
}

const binary = path.join(root, 'desktop/src-tauri/target/release/steppeplan');
if (!fs.existsSync(binary)) {
  console.error(`\nНе найден Tauri-бинарник: ${binary}\nСоберите desktop: cd desktop && npm run build`);
  process.exit(1);
}

fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(path.join(stage, 'app'), { recursive: true });

console.log('\nСобираю portable-пакет…');
fs.copyFileSync(binary, path.join(stage, 'steppeplan'));
fs.chmodSync(path.join(stage, 'steppeplan'), 0o755);
copy(path.join(root, 'dist'), path.join(stage, 'app/dist'));
copy(path.join(root, 'server'), path.join(stage, 'app/server'));
copy(path.join(root, 'mcp'), path.join(stage, 'app/mcp'));
fs.mkdirSync(path.join(stage, 'app/scripts'), { recursive: true });
fs.copyFileSync(
  path.join(root, 'desktop/packaging/update.mjs'),
  path.join(stage, 'app/scripts/update.mjs'),
);
fs.copyFileSync(path.join(root, 'desktop/packaging/install.sh'), path.join(stage, 'install.sh'));
fs.chmodSync(path.join(stage, 'install.sh'), 0o755);
fs.copyFileSync(path.join(root, 'desktop/packaging/README.txt'), path.join(stage, 'README.txt'));
fs.copyFileSync(path.join(root, 'desktop/src-tauri/icons/icon.png'), path.join(stage, 'icon.png'));

const runtimePkg = {
  name: 'steppeplan-runtime',
  private: true,
  version,
  type: 'module',
  dependencies: {
    '@modelcontextprotocol/sdk': pkg.dependencies['@modelcontextprotocol/sdk'],
    nanoid: pkg.dependencies.nanoid,
    zod: pkg.dependencies.zod,
  },
};
fs.writeFileSync(path.join(stage, 'app/package.json'), `${JSON.stringify(runtimePkg, null, 2)}\n`);

run('npm', ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], {
  cwd: path.join(stage, 'app'),
});

// Slim Node runtime. strip is optional; the copy is still valid if it fails.
const nodeTarget = path.join(stage, 'node');
fs.copyFileSync(process.execPath, nodeTarget);
fs.chmodSync(nodeTarget, 0o755);
try {
  execFileSync('strip', ['--strip-all', nodeTarget], { stdio: 'ignore' });
  console.log('node: stripped');
} catch {
  console.log('node: strip недоступен, оставляю как есть');
}

if (fs.existsSync(tarPath)) fs.rmSync(tarPath);
run('tar', ['-czf', tarPath, '-C', releaseDir, stageName]);
const archive = fs.readFileSync(tarPath);
const sha256 = crypto.createHash('sha256').update(archive).digest('hex');
fs.writeFileSync(path.join(releaseDir, 'SHA256SUMS'), `${sha256}  ${tarName}\n`);

const baseUrl = process.env.RELEASE_BASE_URL?.replace(/\/$/, '');
const manifest = {
  version,
  channel: process.env.RELEASE_CHANNEL || 'stable',
  releasedAt: new Date().toISOString(),
  notes: process.env.RELEASE_NOTES || `SteppePlan ${version}`,
  artifacts: {
    [`linux-${arch}`]: {
      url: baseUrl ? `${baseUrl}/${tarName}` : tarName,
      sha256,
      size: archive.length,
    },
  },
};
fs.writeFileSync(path.join(releaseDir, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
console.log(`\nГотово.
  Пакет:   ${tarPath} (${mb(archive.length)})
  SHA256:  ${sha256}
  Манифест: ${path.join(releaseDir, 'latest.json')}
  Установка: tar -xzf ${tarName} && cd ${stageName} && ./install.sh
`);
