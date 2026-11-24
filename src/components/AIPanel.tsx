import { useEffect, useMemo, useRef, useState } from 'react';
import { useActiveConcept, useActiveProvider, useAppStore } from '../store';
import type { AiAction, AiMessage } from '../types';
import { NODE_META } from '../lib/meta';
import { Icon } from './Icons';
import { AutoTextarea } from './AutoTextarea';

const EMPTY_MESSAGES: AiMessage[] = [];

function actionLabel(action: AiAction): { text: string; color: string } {
  if (action.kind === 'node_created') {
    return { text: `+ ${action.title ?? 'узел'}`, color: NODE_META[action.nodeType ?? 'concept']?.color ?? '#A259FF' };
  }
  if (action.kind === 'node_updated') return { text: `✎ ${action.title ?? 'узел'}`, color: '#0D99FF' };
  if (action.kind === 'node_deleted') return { text: `− ${action.title ?? 'узел'}`, color: '#F24822' };
  if (action.kind === 'edge_created') return { text: '→ связь', color: '#14AE5C' };
  if (action.kind === 'edge_updated') return { text: '→ связь обновлена', color: '#0D99FF' };
  return { text: action.kind, color: '#8B8B95' };
}

export function AIPanel() {
  const concept = useActiveConcept();
  const provider = useActiveProvider();
  const selectedNodeId = useAppStore((state) => state.selectedNodeId);
  const activeConceptId = useAppStore((state) => state.activeConceptId);
  const aiByConcept = useAppStore((state) => state.aiByConcept);
  const messages = useMemo(
    () => (activeConceptId ? aiByConcept[activeConceptId] ?? EMPTY_MESSAGES : EMPTY_MESSAGES),
    [activeConceptId, aiByConcept],
  );
  const busy = useAppStore((state) => state.aiBusy);
  const sendAi = useAppStore((state) => state.sendAi);
  const clearAi = useAppStore((state) => state.clearAi);
  const openSettings = useAppStore((state) => state.openSettings);
  const selectNode = useAppStore((state) => state.selectNode);
  const notify = useAppStore((state) => state.notify);

  const [text, setText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const selectedNode = useMemo(
    () => concept?.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [concept, selectedNodeId],
  );

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: messages.length > 2 ? 'smooth' : 'auto' });
  }, [messages.length, busy]);

  const submit = () => {
    const value = text.trim();
    if (!value || busy) return;
    setText('');
    void sendAi(value);
  };

  const suggestions = selectedNode
    ? [
        `Разверни узел «${selectedNode.title}» в 3 подузла`,
        'Какой главный риск в этой ветке?',
        'Что здесь противоречит друг другу?',
      ]
    : [
        'Разложи концепцию на ключевые вопросы',
        'Найди противоречия и слепые зоны',
        'Предложи следующие шаги',
        'Чего не хватает для решения?',
      ];

  const hasKey = provider?.kind === 'demo' || provider?.hasKey;

  if (!concept) {
    return (
      <div className="ai-panel ai-panel--empty">
        <span className="canvas-empty__icon">
          <Icon name="sparkles" size={20} />
        </span>
        <h3>Нет активной концепции</h3>
        <p>Выберите концепцию — ассистент будет работать в её контексте.</p>
      </div>
    );
  }

  return (
    <div className="ai-panel">
      <div className="ai-context">
        <div className="ai-context__row">
          <span className="ai-context__label">Контекст</span>
          <span className="ai-context__value">
            <span className="dot" style={{ background: concept.color }} />
            {concept.name}
          </span>
        </div>
        <div className="ai-context__row">
          <span className="ai-context__label">Фокус</span>
          {selectedNode ? (
            <button className="ai-context__node" onClick={() => selectNode(selectedNode.id, true)}>
              <span style={{ color: NODE_META[selectedNode.type].color }}>
                <Icon name={NODE_META[selectedNode.type].icon} size={11} />
              </span>
              {selectedNode.title}
            </button>
          ) : (
            <span className="ai-context__muted">вся концепция</span>
          )}
        </div>
      </div>

      <button className="ai-provider" onClick={() => openSettings('ai')} title="Настроить провайдера">
        <span className={`ai-provider__dot ${hasKey ? 'is-ok' : 'is-warn'}`} />
        <span className="ai-provider__name">{provider?.name ?? 'Провайдер не выбран'}</span>
        <span className="ai-provider__model">{provider?.model}</span>
        <Icon name="settings" size={12} />
      </button>

      {provider?.kind === 'demo' && (
        <button className="ai-note" onClick={() => openSettings('ai')}>
          <Icon name="sparkles" size={13} />
          <span>
            <strong>Демо-режим.</strong> Работает офлайн и создаёт черновики. Подключите модель, чтобы ассистент
            понимал весь граф.
          </span>
          <Icon name="chevron-right" size={12} />
        </button>
      )}

      {provider && provider.kind !== 'demo' && !provider.hasKey && (
        <button className="ai-note ai-note--warn" onClick={() => openSettings('ai')}>
          <Icon name="alert" size={13} />
          <span>
            <strong>Ключ не задан.</strong> Добавьте API-ключ для «{provider.name}».
          </span>
          <Icon name="chevron-right" size={12} />
        </button>
      )}

      <div className="ai-messages" ref={scrollRef}>
        {!messages.length && (
          <div className="ai-hero">
            <span className="ai-hero__orb">
              <Icon name="sparkles" size={20} />
            </span>
            <h3>Думайте в графе</h3>
            <p>
              Ассистент видит узлы, связи и выделенный фокус. Результат размышления он фиксирует прямо в
              концепции — вы можете поправить всё вручную.
            </p>
            <div className="ai-suggestions">
              {suggestions.map((suggestion) => (
                <button key={suggestion} className="ai-suggestion" onClick={() => void sendAi(suggestion)}>
                  {suggestion}
                  <Icon name="chevron-right" size={12} />
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className={`ai-message ai-message--${message.role} ${message.error ? 'is-error' : ''}`}>
            {message.role === 'assistant' && (
              <span className="ai-message__avatar">
                <Icon name="sparkles" size={12} />
              </span>
            )}
            <div className="ai-message__bubble">
              <div className="ai-message__text">{message.content}</div>
              {!!message.actions?.length && (
                <div className="ai-actions">
                  {message.actions.map((action, index) => {
                    const label = actionLabel(action);
                    const targetId = typeof action.id === 'string' ? action.id : null;
                    const isNode = action.kind.startsWith('node_');
                    return (
                      <button
                        key={`${action.kind}-${action.id ?? index}`}
                        className="ai-action"
                        style={{ color: label.color, borderColor: `${label.color}44` }}
                        title={isNode && targetId ? 'Показать узел' : undefined}
                        onClick={() => {
                          if (action.kind === 'node_created' || action.kind === 'node_updated') {
                            if (targetId) selectNode(targetId, true);
                          } else {
                            notify('Изменение уже в графе');
                          }
                        }}
                      >
                        {label.text}
                      </button>
                    );
                  })}
                </div>
              )}
              {message.role === 'assistant' && message.provider && (
                <div className="ai-message__meta">{message.provider}</div>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div className="ai-message ai-message--assistant">
            <span className="ai-message__avatar">
              <Icon name="sparkles" size={12} />
            </span>
            <div className="ai-typing">
              <span />
              <span />
              <span />
              Смотрю граф…
            </div>
          </div>
        )}
      </div>

      <div className="ai-composer">
        <AutoTextarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={`Спросите про «${concept.name}»…`}
          rows={2}
          maxHeight={200}
          disabled={busy}
        />
        <div className="ai-composer__footer">
          <span className="ai-composer__hint">Enter — отправить · Shift+Enter — строка</span>
          {messages.length > 0 && (
            <button className="link-btn" onClick={clearAi} disabled={busy}>
              Очистить
            </button>
          )}
          <button className="ai-send" onClick={submit} disabled={!text.trim() || busy} title="Отправить">
            <Icon name="arrow-up" size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
