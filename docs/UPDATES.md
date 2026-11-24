# Сборка, установка и обновления

## Что собирается

`npm run package:linux` создаёт portable-пакет:

```
release/
  steppeplan-0.1.8-linux-x86_64.tar.gz
  SHA256SUMS
  latest.json
```

Внутри архива:

```
steppeplan-0.1.8-linux-x86_64/
  steppeplan          # Tauri-оболочка (Rust)
  node                # встроенный Node runtime
  app/
    dist/             # собранный интерфейс
    server/           # HTTP API, store, ИИ-прокси
    mcp/              # MCP-сервер
    scripts/update.mjs
    node_modules/     # только runtime-зависимости
  install.sh
  icon.png
  README.txt
```

Почему так, а не AppImage: приложению нужен стабильный путь к MCP-серверу для конфигурации агентов. Portable-установка в `~/.local/share/steppeplan` даёт постоянный адрес **и** ярлык в меню приложений. AppImage можно добавить позже, но конфиг MCP тогда придётся стабилизировать отдельным шагом.

## Сборка

Требования:

- Node.js 20.19+;
- Rust toolchain (`rustup`, stable);
- Linux-зависимости Tauri v2: `webkit2gtk-4.1`, `gtk3`, `libsoup-3`, `librsvg`, `patchelf`, `pkg-config`;
- для сборки Tauri — интернет (crates.io).

```bash
npm install
cd desktop && npm install && cd ..
npm run package:linux
```

Скрипт синхронизирует версию из корневого `package.json` в `desktop/`, собирает UI и Tauri-бинарник, укладывает runtime-зависимости, сжимает пакет и пишет `latest.json`.

Проверка без полной пересборки:

```bash
node scripts/package-linux.mjs --skip-tauri --skip-ui
```

## Установка

```bash
tar -xzf steppeplan-0.1.8-linux-x86_64.tar.gz
cd steppeplan-0.1.8-linux-x86_64
./install.sh
```

Установщик:

- кладёт файлы в `~/.local/share/steppeplan` (или `--prefix=`);
- сохраняет бэкап `workspace.json` в `~/.steppeplan/backups/` перед заменой;
- создаёт `~/.local/bin/steppeplan`, `steppeplan-mcp`, `steppeplan-update`, `steppeplan-uninstall`, `steppeplan-rollback`;
- добавляет `~/.local/share/applications/steppeplan.desktop` и иконку;
- **не трогает данные** в `~/.steppeplan`.

Запуск: через меню приложений или `steppeplan`.

## Обновления

Модель: неизменяемые архивы + манифест + SHA-256. Данные и приложение разделены, поэтому замена каталога приложения не затрагивает знания.

`latest.json`:

```json
{
  "version": "0.2.0",
  "channel": "stable",
  "releasedAt": "2026-12-01T10:00:00.000Z",
  "notes": "Что нового",
  "artifacts": {
    "linux-x86_64": {
      "url": "https://example.com/steppeplan/steppeplan-0.2.0-linux-x86_64.tar.gz",
      "sha256": "…",
      "size": 12345678
    }
  }
}
```

Релизный скрипт пишет манифест. Чтобы `url` был абсолютным, задайте базу:

```bash
RELEASE_BASE_URL=https://downloads.example.com/steppeplan \
RELEASE_NOTES="Появился diff-режим ИИ" \
npm run package:linux
```

Затем загрузите `tar.gz`, `latest.json` и `SHA256SUMS` на HTTPS-хостинг (GitHub Releases, S3, собственный сервер).

Проверка и установка:

```bash
steppeplan-update --manifest https://downloads.example.com/steppeplan/latest.json --check
steppeplan-update --manifest https://downloads.example.com/steppeplan/latest.json
```

Или сохраните адрес один раз:

```json
// ~/.config/steppeplan/update.json
{ "manifest": "https://downloads.example.com/steppeplan/latest.json" }
```

Обновлятор:

1. читает манифест;
2. сравнивает SemVer;
3. требует `sha256` и сверяет архив;
4. распаковывает во временную папку;
5. запускает `install.sh --update` (атомарная замена каталога, бэкап данных);
6. просит перезапустить приложение.

Автоустановка без вопроса: `--yes`.

### Откат

Установщик хранит предыдущую версию в `~/.local/share/steppeplan.prev`:

```bash
steppeplan-rollback
# или ~/.local/share/steppeplan/install.sh --rollback
```

Бэкапы `workspace.json` лежат в `~/.steppeplan/backups/`.

### Подпись и каналы

Для текущей версии обязательна SHA-256. Перед публичным распространением добавьте:

- HTTPS и подпись манифеста (minisign/GPG) или подпись каждого архива;
- отдельные каналы `stable` и `beta` со своими `latest.json`;
- проверку подписи в `update.mjs` до распаковки;
- CI-сборку в старом glibc-контейнере (AppImage/portable), если нужна совместимость с другими дистрибутивами.

Tauri updater (`tauri-plugin-updater`) можно подключить позже, когда появится собственный URL и ключи подписи. Сейчас обновление намеренно прозрачное: CLI-команда + понятный архив.

## Совместимость данных

- Приложение и данные независимы: обновление не пишет в `workspace.json`, кроме миграций при запуске.
- При изменении схемы увеличивайте `schemaVersion` и добавляйте миграцию в `server/store.mjs`.
- Перед миграцией делайте копию `workspace.json`; установщик уже создаёт бэкап перед заменой файлов.
- MCP-контракт версионируется отдельно в `docs/MCP.md`; удаление/переименование инструментов — ломающее изменение.

## Версионирование

- SemVer: `MAJOR.MINOR.PATCH`.
- `MAJOR` — несовместимый формат данных или MCP-контракта.
- `MINOR` — новые возможности.
- `PATCH` — исправления.
- Версия хранится в `package.json`; `scripts/package-linux.mjs` синхронизирует её в `desktop/package.json`, `tauri.conf.json` и `Cargo.toml`.
- Релиз = git-тег `vX.Y.Z`, архив, `latest.json`, `SHA256SUMS`.

## Ограничения текущего обновления

- Нет проверки обновлений внутри интерфейса — только `steppeplan-update` и релизный манифест.
- Portable-сборка сделана на текущем Linux/glibc; для других дистрибутивов собирайте в контейнере с более старым glibc.
- Подпись манифеста пока не проверяется, только SHA-256 архива.
