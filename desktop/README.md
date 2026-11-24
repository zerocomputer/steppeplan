# SteppePlan desktop (Tauri)

Rust-оболочка для Linux-сборки. Она:

1. находит рядом с собой `node` и `app/server/index.mjs`;
2. запускает локальный сервер на свободном порту `127.0.0.1`;
3. открывает системное окно webview на этом адресе;
4. завершает сервер при выходе.

Данные остаются в `~/.steppeplan`, поэтому desktop, браузерная версия и MCP видят один граф.

## Сборка

```bash
npm install
cd desktop
npm install
npm run build      # tauri build --no-bundle
```

Бинарник: `desktop/src-tauri/target/release/steppeplan`.

Полный portable-пакет с Node runtime, установщиком и манифестом обновлений:

```bash
npm run package:linux
```

Структура пакета и процесс обновлений — в `docs/UPDATES.md`.

## Режим разработки

Запустите бинарник после `npm run build` в корне: Rust найдёт `server/` и `dist/` относительно проекта, если рядом с бинарником нет portable-layout. Для UI с HMR используйте обычный `npm run dev` и браузер.

## Будущее

Следующий шаг — перенести store, HTTP API и AI tool-loop в Rust (Tauri commands), оставив MCP на общем core-crate. Формат `workspace.json` и `src/api.ts` рассчитаны на такую замену.
