import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAppStore, useActiveProvider } from '../store';
import type { AppInfo, ProviderConfig } from '../types';
import { Icon } from './Icons';

function CopyRow({ label, value }: { label: string; value: string }) {
  const notify = useAppStore((state) => state.notify);
  return (
    <div className="copy-row">
      <span className="copy-row__label">{label}</span>
      <code className="copy-row__value">{value}</code>
      <button
        className="icon-btn icon-btn--sm"
        title="Скопировать"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            notify('Скопировано');
          } catch {
            notify('Не удалось скопировать');
          }
        }}
      >
        <Icon name="copy" size={13} />
      </button>
    </div>
  );
}

const KIND_LABEL: Record<ProviderConfig['kind'], string> = {
  demo: 'офлайн',
  openai: 'OpenAI API',
  anthropic: 'Anthropic',
};

function ProviderEditor({ provider }: { provider: ProviderConfig }) {
  const updateProvider = useAppStore((state) => state.updateProvider);
  const setActiveProvider = useAppStore((state) => state.setActiveProvider);
  const notify = useAppStore((state) => state.notify);
  const activeProviderId = useAppStore((state) => state.workspace?.settings.activeProviderId);
  const [draft, setDraft] = useState({ name: provider.name, model: provider.model, baseUrl: provider.baseUrl });
  const [apiKey, setApiKey] = useState('');
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    setDraft({ name: provider.name, model: provider.model, baseUrl: provider.baseUrl });
    setApiKey('');
    setTest(null);
  }, [provider.id, provider.name, provider.model, provider.baseUrl]);

  const isActive = activeProviderId === provider.id;
  const pendingKey = apiKey.trim();

  const save = async (): Promise<boolean> => {
    if (pendingKey && /\s/.test(pendingKey)) {
      notify('Ключ не должен содержать пробелы или переносы строк');
      return false;
    }
    const patch: Partial<ProviderConfig> & { apiKey?: string } = {
      name: draft.name.trim() || provider.name,
      baseUrl: draft.baseUrl.trim(),
      model: draft.model.trim(),
    };
    if (pendingKey) patch.apiKey = pendingKey;
    const ok = await updateProvider(provider.id, patch);
    if (ok) {
      setApiKey('');
      setTest(null);
    }
    return ok;
  };

  return (
    <div className="provider-editor">
      <div className="provider-editor__head">
        <div>
          <h4>{provider.name}</h4>
          <span className="provider-editor__kind">{KIND_LABEL[provider.kind]}</span>
        </div>
        <button
          className={`btn btn--soft ${isActive ? 'is-active' : ''}`}
          onClick={() => void setActiveProvider(provider.id)}
          disabled={isActive}
        >
          {isActive ? 'Активен' : 'Сделать активным'}
        </button>
      </div>

      {provider.kind === 'demo' ? (
        <p className="modal-note">
          Офлайн-режим без сети и ключей. Создаёт черновики узлов и показывает, как работает tool-calling.
          Для настоящего анализа подключите внешнюю модель.
        </p>
      ) : (
        <>
          <label className="field">
            <span className="field__label">Название</span>
            <input
              className="input"
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            />
          </label>

          <label className="field">
            <span className="field__label">Base URL</span>
            <input
              className="input"
              value={draft.baseUrl}
              spellCheck={false}
              onChange={(event) => setDraft((current) => ({ ...current, baseUrl: event.target.value }))}
              placeholder="https://api.example.com/v1"
            />
          </label>

          <label className="field">
            <span className="field__label">Модель</span>
            <input
              className="input"
              value={draft.model}
              spellCheck={false}
              onChange={(event) => setDraft((current) => ({ ...current, model: event.target.value }))}
              placeholder="gpt-4.1-mini"
            />
          </label>

          <label className="field">
            <span className="field__label">
              API-ключ
              <span className={`field__hint ${pendingKey ? 'field__hint--warn' : ''}`}>
                {pendingKey
                  ? 'не сохранён — нажмите «Сохранить»'
                  : provider.hasKey
                    ? 'ключ сохранён локально'
                    : provider.id === 'deepseek'
                      ? 'обычно начинается с sk- · хранится локально'
                      : 'хранится в ~/.steppeplan/secrets.json'}
              </span>
            </span>
            <input
              className="input"
              type="password"
              value={apiKey}
              onChange={(event) => {
                setApiKey(event.target.value);
                setTest(null);
              }}
              placeholder={provider.hasKey ? '•••••••• (оставьте пустым, чтобы не менять)' : 'sk-…'}
              autoComplete="new-password"
              spellCheck={false}
            />
          </label>

          <div className="provider-actions">
            <button className="btn btn--primary" onClick={() => void save()}>
              Сохранить
            </button>
            <button
              className="btn btn--soft"
              disabled={testing}
              onClick={async () => {
                setTesting(true);
                try {
                  // Save first: testing must use the key the user just typed,
                  // not the old one from secrets.json.
                  if (!(await save())) return;
                  const result = await api.testProvider(provider.id);
                  setTest(result);
                } catch (error) {
                  setTest({ ok: false, message: (error as Error).message });
                } finally {
                  setTesting(false);
                }
              }}
            >
              {testing ? 'Проверяем…' : 'Сохранить и проверить'}
            </button>
            {provider.hasKey && (
              <button
                className="link-btn link-btn--danger"
                onClick={() => {
                  void updateProvider(provider.id, { apiKey: '' }).then((ok) => {
                    if (ok) setTest(null);
                  });
                }}
              >
                Удалить ключ
              </button>
            )}
          </div>
          {test && (
            <div className={`test-result ${test.ok ? 'is-ok' : 'is-fail'}`}>
              <Icon name={test.ok ? 'check-circle' : 'alert'} size={13} />
              {test.message}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AiTab() {
  const providers = useAppStore((state) => state.workspace?.settings.providers ?? []);
  const activeProviderId = useAppStore((state) => state.workspace?.settings.activeProviderId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = providers.find((provider) => provider.id === (selectedId ?? activeProviderId)) ?? providers[0];

  return (
    <div className="settings-ai">
      <p className="modal-note">
        Встроенный ассистент вызывает инструменты и меняет граф. Ключи не покидают этот компьютер, кроме
        запросов к выбранному провайдеру. Для локальных моделей подойдёт Ollama или LM Studio.
      </p>
      <div className="provider-layout">
        <div className="provider-list">
          {providers.map((provider) => {
            const isActive = provider.id === activeProviderId;
            const isSelected = provider.id === selected?.id;
            return (
              <button
                key={provider.id}
                className={`provider-row ${isSelected ? 'is-selected' : ''}`}
                onClick={() => setSelectedId(provider.id)}
              >
                <span className={`provider-radio ${isActive ? 'is-active' : ''}`} title={isActive ? 'Активный провайдер' : ''} />
                <span className="provider-row__text">
                  <strong>{provider.name}</strong>
                  <span>{provider.model}</span>
                </span>
                {provider.kind === 'demo' ? (
                  <span className="provider-row__flag">офлайн</span>
                ) : provider.hasKey ? (
                  <span className="provider-row__flag provider-row__flag--ok">готов</span>
                ) : (
                  <span className="provider-row__flag provider-row__flag--warn">нет ключа</span>
                )}
              </button>
            );
          })}
        </div>
        <div className="provider-detail">{selected && <ProviderEditor key={selected.id} provider={selected} />}</div>
      </div>
    </div>
  );
}

function AppearanceTab() {
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const uiScale = useAppStore((state) => state.uiScale);
  const setUiScale = useAppStore((state) => state.setUiScale);
  return (
    <div className="appearance">
      <div className="scale-control">
        <div className="scale-control__head">
          <div>
            <strong>Масштаб интерфейса</strong>
            <span>Удобно на 4K и больших мониторах</span>
          </div>
          <output>{Math.round(uiScale * 100)}%</output>
        </div>
        <input
          className="range"
          type="range"
          min="80"
          max="160"
          step="5"
          value={Math.round(uiScale * 100)}
          onChange={(event) => setUiScale(Number(event.target.value) / 100)}
          aria-label="Масштаб интерфейса"
        />
        <div className="scale-control__foot">
          <span>80%</span>
          <button className="link-btn" onClick={() => setUiScale(1)}>
            Сбросить до 100%
          </button>
          <span>160%</span>
        </div>
      </div>
      <p className="modal-note">Тёмная тема ближе к Figma, светлая — к рабочему столу Apple. Выбор запоминается.</p>
      <div className="theme-cards">
        <button className={`theme-card ${theme === 'dark' ? 'is-active' : ''}`} onClick={() => setTheme('dark')}>
          <span className="theme-preview theme-preview--dark">
            <span />
            <span />
            <span />
          </span>
          <span className="theme-card__label">
            <Icon name="moon" size={14} />
            Тёмная
          </span>
        </button>
        <button className={`theme-card ${theme === 'light' ? 'is-active' : ''}`} onClick={() => setTheme('light')}>
          <span className="theme-preview theme-preview--light">
            <span />
            <span />
            <span />
          </span>
          <span className="theme-card__label">
            <Icon name="sun" size={14} />
            Светлая
          </span>
        </button>
      </div>
      <div className="settings-fact">
        <Icon name="lock" size={14} />
        <div>
          <strong>Local-first</strong>
          <p>Проекты и концепции хранятся в обычном JSON-файле. Облако и совместный доступ — следующий слой, не обязательный для работы.</p>
        </div>
      </div>
    </div>
  );
}

function DataTab() {
  const notify = useAppStore((state) => state.notify);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getInfo()
      .then(setInfo)
      .catch((err: Error) => setError(err.message));
  }, []);

  const opencodeConfig = info
    ? JSON.stringify(
        {
          $schema: 'https://opencode.ai/config.json',
          mcp: {
            servers: {
              steppeplan: {
                type: 'local',
                command: [info.mcp.command, ...info.mcp.args],
              },
            },
          },
        },
        null,
        2,
      )
    : '';

  const claudeConfig = info
    ? JSON.stringify(
        {
          mcpServers: {
            steppeplan: {
              command: info.mcp.command,
              args: info.mcp.args,
            },
          },
        },
        null,
        2,
      )
    : '';

  return (
    <div className="data-tab">
      <p className="modal-note">
        MCP-сервер отдаёт агентам тот же граф, что вы видите на холсте. Правки агента прилетают в интерфейс
        мгновенно. Серверу не нужен открытый браузер — достаточно файла данных.
      </p>

      {error && <div className="test-result is-fail">{error}</div>}

      <div className="settings-block">
        <h4>Подключить в opencode</h4>
        <p>
          Добавьте в <code>opencode.jsonc</code> проекта или в глобальный конфиг. Серверы живут под{' '}
          <code>mcp.servers</code>:
        </p>
        <pre className="code-block">{opencodeConfig || 'Загрузка…'}</pre>
        <button
          className="btn btn--soft"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(opencodeConfig);
              notify('Конфиг opencode скопирован');
            } catch {
              notify('Не удалось скопировать');
            }
          }}
        >
          <Icon name="copy" size={13} />
          Скопировать конфиг
        </button>
      </div>

      <details className="settings-block">
        <summary>Claude Desktop / другой MCP-клиент</summary>
        <p>Формат конфигурации для клиентов с секцией <code>mcpServers</code>:</p>
        <pre className="code-block">{claudeConfig || 'Загрузка…'}</pre>
      </details>

      <div className="settings-block">
        <h4>Что умеет агент</h4>
        <ul className="plain-list">
          <li><code>list_projects</code>, <code>get_project</code>, <code>get_concept</code> — читать структуру;</li>
          <li><code>search_nodes</code> — искать знания по всем проектам;</li>
          <li><code>add_node</code>, <code>update_node</code>, <code>delete_node</code> — вести узлы;</li>
          <li><code>add_edge</code>, <code>update_edge</code>, <code>delete_edge</code> — связывать смыслы;</li>
          <li>ресурсы <code>steppeplan://workspace</code> и <code>steppeplan://concept/&lt;id&gt;</code>.</li>
        </ul>
        <p className="modal-note">
          OpenCode подхватывает конфиг автоматически — проверьте подключение командой <code>opencode mcp list</code>.
          Claude Desktop и другие клиенты обычно требуют перезапуска.
        </p>
      </div>

      <div className="settings-block">
        <h4>Данные</h4>
        {info ? (
          <>
            <CopyRow label="Workspace" value={info.dataFile} />
            <div className="data-actions">
              <a className="btn btn--soft" href="/api/export" download>
                <Icon name="copy" size={13} />
                Экспорт JSON
              </a>
              <span className="muted-copy">Ревизия {info.revision} · {info.projects} проектов</span>
            </div>
            <div className="app-version">
              Версия {info.version} · {info.desktop ? 'Linux desktop' : 'веб-версия'}
            </div>
            {info.desktop && (
              <p className="modal-note app-version__note">
                Обновление: <code>steppeplan-update --manifest &lt;url&gt;</code>. Данные в{' '}
                <code>~/.steppeplan</code> сохраняются отдельно от приложения.
              </p>
            )}
          </>
        ) : (
          <p className="muted-copy">Загрузка…</p>
        )}
      </div>
    </div>
  );
}

export function SettingsModal() {
  const open = useAppStore((state) => state.settingsOpen);
  const tab = useAppStore((state) => state.settingsTab);
  const setTab = useAppStore((state) => state.setSettingsTab);
  const close = useAppStore((state) => state.closeSettings);
  const provider = useActiveProvider();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <header className="modal__head">
          <div>
            <h2>Настройки</h2>
            <p>ИИ, внешний вид и мост для агентов</p>
          </div>
          <button className="icon-btn" onClick={close} title="Закрыть">
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="modal__tabs">
          <button className={`modal__tab ${tab === 'ai' ? 'is-active' : ''}`} onClick={() => setTab('ai')}>
            <Icon name="sparkles" size={13} /> ИИ
            <span className="modal__tab-note">{provider?.name}</span>
          </button>
          <button className={`modal__tab ${tab === 'appearance' ? 'is-active' : ''}`} onClick={() => setTab('appearance')}>
            <Icon name="sun" size={13} /> Вид
          </button>
          <button className={`modal__tab ${tab === 'data' ? 'is-active' : ''}`} onClick={() => setTab('data')}>
            <Icon name="link" size={13} /> Данные и MCP
          </button>
        </div>

        <div className="modal__body">
          {tab === 'ai' && <AiTab />}
          {tab === 'appearance' && <AppearanceTab />}
          {tab === 'data' && <DataTab />}
        </div>

        <footer className="modal__foot">
          <span>SteppePlan · открытый исходный код</span>
          <span>Локальные данные · без аккаунта</span>
        </footer>
      </div>
    </div>
  );
}
