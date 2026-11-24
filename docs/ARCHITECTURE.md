# Архитектура SteppePlan

## Цели

1. **Local-first.** Человек работает без сети и без аккаунта; данные принадлежат ему.
2. **Один граф — два потребителя.** UI и ИИ-агенты читают и пишут одну и ту же модель, а не две копии.
3. **Готовность к Tauri.** Webview и локальный «демон» разделены; Rust-обёртка или перенос store на Rust не должны требовать переписывания интерфейса.
4. **Простота ядра.** Минимум зависимостей и инфраструктуры: файл, HTTP, SSE, stdio MCP.

## Компоненты

```mermaid
flowchart LR
  subgraph Desktop["Tauri (Linux/macOS/Windows)"]
    Rust["Rust shell<br/>start/stop · window"]
    UI["React UI<br/>React Flow · Zustand"]
  end
  subgraph Local["127.0.0.1"]
    HTTP["HTTP API + SSE<br/>server/index.mjs"]
    AI["AI tool loop<br/>server/ai.mjs"]
    Store["Store<br/>server/store.mjs"]
    MCP["MCP server (stdio)<br/>mcp/server.mjs"]
    File[("workspace.json")]
    Secrets[("secrets.json")]
  end
  LLM["LLM provider"]
  Agent["AI agent / opencode / Claude"]

  Rust -- webview --> UI
  UI -- REST --> HTTP
  HTTP -- SSE --> UI
  HTTP --> Store
  HTTP --> AI
  AI -- HTTPS --> LLM
  AI --> Store
  Agent -- MCP stdio --> MCP
  MCP --> Store
  Store -- atomic write --> File
  Store --> Secrets
  File -. fs.watch .-> HTTP
```

| Файл | Роль |
| --- | --- |
| `src/` | Интерфейс: холст, панели, инспектор, ИИ-чат, настройки |
| `server/index.mjs` | HTTP API, SSE, статика собранного UI, watcher файла |
| `server/store.mjs` | Единственный слой мутаций, файловый формат, блокировка, секреты |
| `server/ai.mjs` | Провайдеры, нормализация tool calling, tool-loop, демо-режим |
| `server/seed.mjs` | Демо-пространство первого запуска |
| `mcp/server.mjs` | MCP-сервер поверх store, инструменты и ресурсы |
| `desktop/` | Tauri-оболочка (Rust), portable Linux-сборка и установщик |
| `scripts/*-smoke.mjs` | Автономные проверки MCP и ИИ-конвейера |

## Таблицы

Данные модели удобно хранить обычным узлом `table`:

```json
{
  "type": "table",
  "table": {
    "columns": ["Критерий", "Значение"],
    "rows": [["Скорость", "высокая"]]
  }
}
```

Таблица рендерится на карточке, редактируется в инспекторе, ресайзится и связывается как обычный узел. MCP-инструмент `read_table` превращает её в Markdown, CSV или JSON.

## Карта: размеры узлов, линии и авто-раскладка

- Узел можно растянуть за углы при выделении (`NodeResizer`); `width`/`height` сохраняются в узле и учитываются авто-раскладкой.
- У связи есть `lane` — вертикальное смещение среднего сегмента. Его можно потянуть за маркер на выделенной линии или задать в инспекторе; положение узлов при этом не меняется.
- Кликабельная зона связи — 34 px прозрачной линии, поэтому не нужно целиться в 1–2 px.
- `layoutGraph` (Dagre) — прежняя иерархическая раскладка; `layoutGrid` — компактная сетка по логическому порядку. Обе получают измеренные размеры карточек и не сбрасывают lane связей.
- После хода ИИ новые узлы собираются в кластер рядом с якорем и не двигают уже существующие карточки.

## Панели, масштаб интерфейса и поля

- Ширина левой панели и инспектора меняется перетаскиванием разделителей; значения хранятся в `localStorage` (`steppeplan.panels.v1`).
- Авто-раскладка получает `measured` размеры React Flow, поэтому учитывает и растянутые карточки, а не только базовые 252×148.

- Ползунок 80–160% в **Настройки → Вид**, значение хранится в `localStorage` (`steppeplan.ui.v1`).
- В Linux desktop масштаб применяется **нативно** через Tauri-команду `set_ui_zoom` (permission `allow-set-ui-zoom`, remote capability для `http://127.0.0.1:*/**`). Это сохраняет корректные координаты React Flow, перетаскивание и попадание в курсор.
- В браузере используется CSS `zoom` fallback: `.app { zoom: var(--ui-scale); width/height: 100vw/100vh ÷ scale }`. Визуально масштабируется всё; desktop — предпочтительный режим для 4K.
- Все многострочные поля инспектора и ИИ-композер используют `AutoTextarea`: высота растёт по `scrollHeight` до лимита, затем появляется внутренний скролл.
