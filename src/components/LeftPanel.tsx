import { useMemo, useState } from 'react';
import { useActiveConcept, useActiveProject, useAppStore } from '../store';
import { NODE_META, NODE_TYPE_ORDER } from '../lib/meta';
import { Icon } from './Icons';

function InlineAdd({
  placeholder,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState('');
  return (
    <form
      className="inline-add"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = value.trim();
        if (trimmed) onSubmit(trimmed);
      }}
    >
      <input
        autoFocus
        value={value}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel();
        }}
        onBlur={() => {
          if (!value.trim()) onCancel();
        }}
      />
      <button type="submit" className="inline-add__submit" title="Создать">
        <Icon name="arrow-up" size={13} />
      </button>
    </form>
  );
}

export function LeftPanel() {
  const projects = useAppStore((state) => state.workspace?.projects ?? []);
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const activeConceptId = useAppStore((state) => state.activeConceptId);
  const selectedNodeId = useAppStore((state) => state.selectedNodeId);
  const setActiveProject = useAppStore((state) => state.setActiveProject);
  const setActiveConcept = useAppStore((state) => state.setActiveConcept);
  const selectNode = useAppStore((state) => state.selectNode);
  const createProject = useAppStore((state) => state.createProject);
  const createConcept = useAppStore((state) => state.createConcept);
  const openSettings = useAppStore((state) => state.openSettings);

  const project = useActiveProject();
  const concept = useActiveConcept();
  const [addingProject, setAddingProject] = useState(false);
  const [addingConcept, setAddingConcept] = useState(false);
  const [query, setQuery] = useState('');

  const outline = useMemo(() => {
    if (!concept) return [];
    const needle = query.trim().toLowerCase();
    return [...concept.nodes]
      .filter((node) => {
        if (!needle) return true;
        return `${node.title} ${node.summary} ${node.tags.join(' ')}`.toLowerCase().includes(needle);
      })
      .sort((a, b) => {
        const typeDelta = NODE_TYPE_ORDER.indexOf(a.type) - NODE_TYPE_ORDER.indexOf(b.type);
        if (typeDelta !== 0) return typeDelta;
        return a.title.localeCompare(b.title, 'ru');
      });
  }, [concept, query]);

  return (
    <aside className="panel left-panel">
      <div className="left-panel__scroll">
        <section className="panel-section">
          <div className="section-head">
            <span className="section-title">Проекты</span>
            <button className="icon-btn icon-btn--sm" title="Новый проект" onClick={() => setAddingProject(true)}>
              <Icon name="plus" size={14} />
            </button>
          </div>

          <div className="project-list">
            {projects.map((item) => (
              <button
                key={item.id}
                className={`project-row ${item.id === activeProjectId ? 'is-active' : ''}`}
                onClick={() => setActiveProject(item.id)}
                title={item.description}
              >
                <span className="project-row__dot" style={{ background: item.color }} />
                <span className="project-row__name">{item.name}</span>
                <span className="project-row__count">{item.concepts.length}</span>
              </button>
            ))}
            {!projects.length && !addingProject && (
              <p className="empty-hint">Пока нет проектов. Создайте первый — это займёт секунду.</p>
            )}
            {addingProject && (
              <InlineAdd
                placeholder="Название проекта"
                onSubmit={(value) => {
                  setAddingProject(false);
                  void createProject(value);
                }}
                onCancel={() => setAddingProject(false)}
              />
            )}
          </div>
        </section>

        <section className="panel-section">
          <div className="section-head">
            <span className="section-title">Концепции</span>
            <button
              className="icon-btn icon-btn--sm"
              title="Новая концепция"
              onClick={() => setAddingConcept(true)}
              disabled={!project}
            >
              <Icon name="plus" size={14} />
            </button>
          </div>

          {project ? (
            <div className="concept-list">
              {project.concepts.map((item) => (
                <button
                  key={item.id}
                  className={`concept-row ${item.id === activeConceptId ? 'is-active' : ''}`}
                  onClick={() => setActiveConcept(item.id)}
                  title={item.description}
                >
                  <span className="concept-row__mark" style={{ background: item.color }} />
                  <span className="concept-row__name">{item.name}</span>
                  <span className="concept-row__count">{item.nodes.length}</span>
                </button>
              ))}
              {!project.concepts.length && !addingConcept && (
                <p className="empty-hint">В проекте ещё нет концепций.</p>
              )}
              {addingConcept && (
                <InlineAdd
                  placeholder="Название концепции"
                  onSubmit={(value) => {
                    setAddingConcept(false);
                    void createConcept(value);
                  }}
                  onCancel={() => setAddingConcept(false)}
                />
              )}
            </div>
          ) : (
            <p className="empty-hint">Сначала выберите или создайте проект.</p>
          )}
        </section>

        <section className="panel-section panel-section--outline">
          <div className="section-head">
            <span className="section-title">Структура</span>
            <span className="section-counter">{concept?.nodes.length ?? 0}</span>
          </div>

          <label className="search-field">
            <Icon name="search" size={13} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Найти узел"
              spellCheck={false}
            />
            {query && (
              <button className="search-field__clear" onClick={() => setQuery('')} title="Очистить">
                <Icon name="close" size={11} />
              </button>
            )}
          </label>

          <div className="outline">
            {outline.map((node) => {
              const meta = NODE_META[node.type];
              return (
                <button
                  key={node.id}
                  className={`outline-row ${node.id === selectedNodeId ? 'is-active' : ''}`}
                  onClick={() => selectNode(node.id, true)}
                  title={node.summary || node.title}
                >
                  <span className="outline-row__icon" style={{ color: meta.color }}>
                    <Icon name={meta.icon} size={13} />
                  </span>
                  <span className="outline-row__title">{node.title}</span>
                  {node.status !== 'open' && (
                    <span
                      className={`status-dot status-dot--${node.status}`}
                      title={node.status === 'done' ? 'Готово' : node.status === 'active' ? 'В работе' : 'Отложен'}
                    />
                  )}
                </button>
              );
            })}
            {concept && !outline.length && (
              <p className="empty-hint">{query ? 'Ничего не найдено.' : 'Узлы появятся здесь.'}</p>
            )}
            {!concept && <p className="empty-hint">Выберите концепцию.</p>}
          </div>
        </section>
      </div>

      <div className="left-panel__footer">
        <button className="mcp-card" onClick={() => openSettings('data')}>
          <span className="mcp-card__icon">
            <Icon name="link" size={14} />
          </span>
          <span className="mcp-card__text">
            <strong>MCP-мост</strong>
            <span>Агент читает и дополняет граф</span>
          </span>
          <Icon name="chevron-right" size={13} className="mcp-card__chevron" />
        </button>
        <div className="storage-hint">
          <span className="storage-hint__dot" />
          ~/.steppeplan · локальное хранилище
        </div>
      </div>
    </aside>
  );
}
