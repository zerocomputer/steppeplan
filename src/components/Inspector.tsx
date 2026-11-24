import { useEffect, useRef, useState } from 'react';
import { useActiveConcept, useActiveProject, useAppStore } from '../store';
import type { PlanEdge, PlanNode } from '../types';
import {
  CONCEPT_COLORS,
  EDGE_KINDS,
  EDGE_META,
  NODE_META,
  NODE_TYPE_ORDER,
  ORIGIN_LABEL,
  STATUS_META,
} from '../lib/meta';
import { Icon } from './Icons';
import { AutoTextarea } from './AutoTextarea';
import type { PlanTable } from '../types';

function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  className = '',
}: {
  label: string;
  confirmLabel?: string;
  onConfirm: () => void;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), 3200);
    return () => window.clearTimeout(timer);
  }, [armed]);
  return (
    <button
      className={`btn btn--danger ${armed ? 'is-armed' : ''} ${className}`}
      onClick={() => {
        if (armed) {
          onConfirm();
          setArmed(false);
        } else {
          setArmed(true);
        }
      }}
    >
      <Icon name="trash" size={13} />
      {armed ? confirmLabel ?? 'Точно?' : label}
    </button>
  );
}

function formatDate(iso: string) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function plural(count: number, one: string, few: string, many: string) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function splitTags(value: string) {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function CopyId({ value }: { value: string }) {
  const notify = useAppStore((state) => state.notify);
  return (
    <button
      className="copy-id"
      title="Скопировать ID для MCP-агента"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          notify('ID скопирован');
        } catch {
          notify('Не удалось скопировать');
        }
      }}
    >
      <code>{value}</code>
      <Icon name="copy" size={12} />
    </button>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span className="field__label">
        {label}
        {hint && <span className="field__hint">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function NodeInspector({ node }: { node: PlanNode }) {
  const concept = useActiveConcept();
  const updateNode = useAppStore((state) => state.updateNode);
  const deleteNode = useAppStore((state) => state.deleteNode);
  const deleteEdge = useAppStore((state) => state.deleteEdge);
  const selectNode = useAppStore((state) => state.selectNode);
  const [draft, setDraft] = useState({
    title: node.title,
    summary: node.summary,
    body: node.body,
    tags: node.tags.join(', '),
  });
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<Partial<PlanNode> | null>(null);
  const nodeId = node.id;

  const flush = () => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    if (pending.current && Object.keys(pending.current).length) {
      void updateNode(nodeId, pending.current);
      pending.current = null;
    }
  };

  const flushRef = useRef(flush);
  flushRef.current = flush;

  useEffect(() => {
    setDraft({
      title: node.title,
      summary: node.summary,
      body: node.body,
      tags: node.tags.join(', '),
    });
    // Only reset the editor when a different node or external update arrives.
  }, [node.id, node.updatedAt]);

  useEffect(() => () => flushRef.current(), []);

  const schedule = (patch: Partial<PlanNode>) => {
    pending.current = { ...(pending.current ?? {}), ...patch };
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => flushRef.current(), 700);
  };

  const [table, setTable] = useState<PlanTable>(
    node.table ?? { columns: ['Колонка 1', 'Колонка 2'], rows: [['', '']] },
  );

  useEffect(() => {
    setTable(node.table ?? { columns: ['Колонка 1', 'Колонка 2'], rows: [['', '']] });
  }, [node.id, node.updatedAt]);

  const updateTable = (next: PlanTable) => {
    setTable(next);
    schedule({ table: next });
  };

  const addColumn = () => {
    if (table.columns.length >= 12) return;
    updateTable({
      columns: [...table.columns, `Колонка ${table.columns.length + 1}`],
      rows: table.rows.map((row) => [...row, '']),
    });
  };

  const removeColumn = (columnIndex: number) => {
    if (table.columns.length <= 1) return;
    updateTable({
      columns: table.columns.filter((_, index) => index !== columnIndex),
      rows: table.rows.map((row) => row.filter((_, index) => index !== columnIndex)),
    });
  };

  const addRow = () => {
    if (table.rows.length >= 200) return;
    updateTable({ columns: table.columns, rows: [...table.rows, table.columns.map(() => '')] });
  };

  const removeRow = (rowIndex: number) => {
    updateTable({ columns: table.columns, rows: table.rows.filter((_, index) => index !== rowIndex) });
  };

  const setCell = (rowIndex: number, columnIndex: number, value: string) => {
    updateTable({
      columns: table.columns,
      rows: table.rows.map((row, r) =>
        r === rowIndex ? row.map((cell, c) => (c === columnIndex ? value : cell)) : row,
      ),
    });
  };

  const meta = NODE_META[node.type];
  const incoming = concept?.edges.filter((edge) => edge.target === node.id) ?? [];
  const outgoing = concept?.edges.filter((edge) => edge.source === node.id) ?? [];
  const titleOf = (id: string) => concept?.nodes.find((item) => item.id === id)?.title ?? id;

  const edgeRow = (edge: PlanEdge, direction: 'in' | 'out') => (
    <div className="edge-row" key={edge.id}>
      <span className="edge-row__kind" style={{ color: EDGE_META[edge.kind].color }}>
        {direction === 'in' ? '←' : '→'} {EDGE_META[edge.kind].short}
      </span>
      <button
        className="edge-row__node"
        onClick={() => selectNode(direction === 'in' ? edge.source : edge.target, true)}
        title="Перейти к узлу"
      >
        {titleOf(direction === 'in' ? edge.source : edge.target)}
      </button>
      <button
        className="edge-row__remove"
        title="Удалить связь"
        onClick={() => {
          if (edge.id) void deleteEdge(edge.id);
        }}
      >
        <Icon name="close" size={11} />
      </button>
    </div>
  );

  return (
    <div className="inspector">
      <div className="inspector__header">
        <span className="inspector__badge" style={{ color: meta.color, background: `${meta.color}1f` }}>
          <Icon name={meta.icon} size={13} />
          {meta.label}
        </span>
        <span className="inspector__badge inspector__badge--muted">{ORIGIN_LABEL[node.origin] ?? node.origin}</span>
        <span className="inspector__spacer" />
        <button
          className="icon-btn icon-btn--sm"
          title="Открыть в ИИ"
          onClick={() => useAppStore.setState({ rightTab: 'ai' })}
        >
          <Icon name="sparkles" size={14} />
        </button>
      </div>

      <Field label="Название">
        <input
          className="input"
          value={draft.title}
          onChange={(event) => {
            const value = event.target.value;
            setDraft((current) => ({ ...current, title: value }));
            schedule({ title: value });
          }}
          onBlur={flush}
          placeholder="О чём этот узел"
        />
      </Field>

      <Field label="Суть" hint="1–2 предложения">
        <AutoTextarea
          className="textarea textarea--auto"
          rows={2}
          maxHeight={260}
          value={draft.summary}
          onChange={(event) => {
            const value = event.target.value;
            setDraft((current) => ({ ...current, summary: value }));
            schedule({ summary: value });
          }}
          onBlur={flush}
          placeholder="Коротко сформулируйте мысль"
        />
      </Field>

      <Field label="Подробности" hint="аргументы, ссылки, контекст">
        <AutoTextarea
          className="textarea textarea--mono textarea--auto"
          rows={3}
          maxHeight={360}
          value={draft.body}
          onChange={(event) => {
            const value = event.target.value;
            setDraft((current) => ({ ...current, body: value }));
            schedule({ body: value });
          }}
          onBlur={flush}
          placeholder="Всё, что важно не потерять"
        />
      </Field>

      <Field label="Теги" hint="через запятую">
        <input
          className="input"
          value={draft.tags}
          onChange={(event) => {
            const value = event.target.value;
            setDraft((current) => ({ ...current, tags: value }));
            schedule({ tags: splitTags(value) });
          }}
          onBlur={flush}
          placeholder="продукт, гипотеза"
        />
      </Field>

      <div className="field-grid">
        <div className="field">
          <span className="field__label">Тип</span>
          <div className="type-grid">
            {NODE_TYPE_ORDER.map((type) => (
              <button
                key={type}
                className={`type-chip ${node.type === type ? 'is-active' : ''}`}
                style={{ color: NODE_META[type].color, borderColor: node.type === type ? `${NODE_META[type].color}88` : undefined }}
                onClick={() => void updateNode(node.id, { type })}
                title={NODE_META[type].hint}
              >
                <Icon name={NODE_META[type].icon} size={13} />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="field">
        <span className="field__label">Статус</span>
        <div className="status-row">
          {(Object.keys(STATUS_META) as Array<keyof typeof STATUS_META>).map((status) => (
            <button
              key={status}
              className={`status-choice ${node.status === status ? 'is-active' : ''}`}
              onClick={() => void updateNode(node.id, { status })}
              style={{ color: node.status === status ? STATUS_META[status].color : undefined }}
            >
              <span className="status-pill__dot" style={{ background: STATUS_META[status].color }} />
              {STATUS_META[status].label}
            </button>
          ))}
        </div>
      </div>

      {node.type === 'table' && (
        <section className="inspector__section">
          <div className="inspector__section-head">
            <span>Таблица</span>
            <div className="sheet-actions">
              <button className="link-btn" onClick={addColumn}>
                + колонка
              </button>
              <button className="link-btn" onClick={addRow}>
                + строка
              </button>
            </div>
          </div>
          <div className="sheet-wrap">
            <table className="sheet">
              <thead>
                <tr>
                  {table.columns.map((column, columnIndex) => (
                    <th key={columnIndex}>
                      <div className="sheet-head">
                        <input
                          className="input sheet-cell"
                          value={column}
                          onChange={(event) =>
                            updateTable({
                              columns: table.columns.map((item, index) =>
                                index === columnIndex ? event.target.value : item,
                              ),
                              rows: table.rows,
                            })
                          }
                          onBlur={flush}
                        />
                        <button
                          className="sheet-remove"
                          title="Удалить колонку"
                          disabled={table.columns.length <= 1}
                          onClick={() => removeColumn(columnIndex)}
                        >
                          <Icon name="close" size={9} />
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {table.columns.map((_, columnIndex) => (
                      <td key={columnIndex}>
                        <input
                          className="input sheet-cell"
                          value={row[columnIndex] ?? ''}
                          onChange={(event) => setCell(rowIndex, columnIndex, event.target.value)}
                          onBlur={flush}
                          placeholder="—"
                        />
                      </td>
                    ))}
                    <td className="sheet-row-action">
                      <button className="sheet-remove" title="Удалить строку" onClick={() => removeRow(rowIndex)}>
                        <Icon name="trash" size={11} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!table.rows.length && <p className="empty-hint">Строк пока нет — добавьте первую.</p>}
          <p className="muted-copy">Таблица хранится в узле и доступна агенту через MCP-инструмент read_table.</p>
        </section>
      )}


      <section className="inspector__section">
        <div className="inspector__section-head">
          <span>Связи</span>
          <span className="inspector__section-count">{incoming.length + outgoing.length}</span>
        </div>
        {!incoming.length && !outgoing.length && (
          <p className="empty-hint">Потяните за точку справа от узла, чтобы создать связь.</p>
        )}
        {outgoing.length > 0 && (
          <div className="edge-group">
            <span className="edge-group__label">Исходящие</span>
            {outgoing.map((edge) => edgeRow(edge, 'out'))}
          </div>
        )}
        {incoming.length > 0 && (
          <div className="edge-group">
            <span className="edge-group__label">Входящие</span>
            {incoming.map((edge) => edgeRow(edge, 'in'))}
          </div>
        )}
        <p className="muted-copy">
          Связи создаются перетаскиванием от точки справа к другому узлу. Размер блока меняется
          за угол выделенного узла на холсте.
        </p>
      </section>

      <section className="inspector__section">
        <div className="inspector__section-head">
          <span>Метаданные</span>
        </div>
        <div className="meta-row">
          <span>ID</span>
          <CopyId value={node.id} />
        </div>
        <div className="meta-row">
          <span>Обновлён</span>
          <span>{formatDate(node.updatedAt)}</span>
        </div>
      </section>

      <ConfirmButton label="Удалить узел" confirmLabel="Удалить узел и связи" onConfirm={() => void deleteNode(node.id)} />
    </div>
  );
}

function EdgeInspector({ edge }: { edge: PlanEdge }) {
  const concept = useActiveConcept();
  const updateEdge = useAppStore((state) => state.updateEdge);
  const deleteEdge = useAppStore((state) => state.deleteEdge);
  const selectNode = useAppStore((state) => state.selectNode);
  const [label, setLabel] = useState(edge.label);
  const [lane, setLane] = useState(edge.lane ?? 0);

  useEffect(() => {
    setLabel(edge.label);
    setLane(edge.lane ?? 0);
  }, [edge.id, edge.label, edge.lane]);

  const titleOf = (id: string) => concept?.nodes.find((item) => item.id === id)?.title ?? id;

  const commitLane = (value: number) => {
    if ((edge.lane ?? 0) !== value) void updateEdge(edge.id, { lane: value });
  };

  return (
    <div className="inspector">
      <div className="inspector__header">
        <span className="inspector__badge" style={{ color: EDGE_META[edge.kind].color, background: `${EDGE_META[edge.kind].color}1f` }}>
          <Icon name="link" size={13} />
          Связь
        </span>
      </div>

      <div className="edge-route">
        <button onClick={() => selectNode(edge.source, true)}>{titleOf(edge.source)}</button>
        <span className="edge-route__arrow" style={{ color: EDGE_META[edge.kind].color }}>
          →
        </span>
        <button onClick={() => selectNode(edge.target, true)}>{titleOf(edge.target)}</button>
      </div>

      <div className="field">
        <span className="field__label">Тип связи</span>
        <div className="kind-list">
          {EDGE_KINDS.map((kind) => (
            <button
              key={kind}
              className={`kind-choice ${edge.kind === kind ? 'is-active' : ''}`}
              style={{ color: EDGE_META[kind].color, borderColor: edge.kind === kind ? `${EDGE_META[kind].color}88` : undefined }}
              onClick={() => void updateEdge(edge.id, { kind })}
            >
              {EDGE_META[kind].label}
            </button>
          ))}
        </div>
      </div>

      <Field label="Подпись" hint="необязательно">
        <input
          className="input"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          onBlur={() => {
            if (label !== edge.label) void updateEdge(edge.id, { label });
          }}
          placeholder="Почему эти узлы связаны"
        />
      </Field>

      <Field label="Смещение линии" hint="вверх или вниз, чтобы развести связи">
        <div className="lane-control">
          <input
            className="range"
            type="range"
            min="-300"
            max="300"
            step="5"
            value={lane}
            onChange={(event) => setLane(Number(event.target.value))}
            onPointerUp={() => commitLane(lane)}
            onKeyUp={() => commitLane(lane)}
            onBlur={() => commitLane(lane)}
            aria-label="Смещение линии"
          />
          <output>{lane} px</output>
          <button
            className="link-btn"
            onClick={() => {
              setLane(0);
              commitLane(0);
            }}
          >
            Сбросить
          </button>
        </div>
      </Field>

      <section className="inspector__section">
        <div className="meta-row">
          <span>ID</span>
          <CopyId value={edge.id} />
        </div>
      </section>

      <ConfirmButton label="Удалить связь" onConfirm={() => void deleteEdge(edge.id)} />
    </div>
  );
}

function ConceptInspector() {
  const concept = useActiveConcept();
  const project = useActiveProject();
  const updateConcept = useAppStore((state) => state.updateConcept);
  const deleteConcept = useAppStore((state) => state.deleteConcept);
  const updateProject = useAppStore((state) => state.updateProject);
  const deleteProject = useAppStore((state) => state.deleteProject);
  const setRightTab = useAppStore((state) => state.setRightTab);
  const [draft, setDraft] = useState({ name: concept?.name ?? '', description: concept?.description ?? '' });
  const [projectName, setProjectName] = useState(project?.name ?? '');
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<{ name?: string; description?: string }>({});
  const conceptId = concept?.id ?? null;
  const projectId = project?.id ?? null;

  const flushConcept = () => {
    window.clearTimeout(timer.current);
    const patch = { ...pending.current };
    pending.current = {};
    if (conceptId && Object.keys(patch).length) {
      void updateConcept(conceptId, patch);
    }
  };
  const flushConceptRef = useRef(flushConcept);
  flushConceptRef.current = flushConcept;

  useEffect(() => {
    setDraft({ name: concept?.name ?? '', description: concept?.description ?? '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concept?.id, concept?.updatedAt]);

  useEffect(() => {
    setProjectName(project?.name ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, project?.updatedAt]);

  useEffect(() => () => flushConceptRef.current(), []);

  if (!concept || !project) {
    return (
      <div className="inspector inspector--empty">
        <span className="canvas-empty__icon">
          <Icon name="layers" size={20} />
        </span>
        <h3>Нет активной концепции</h3>
        <p>Создайте концепцию в левой панели, чтобы начать граф.</p>
      </div>
    );
  }

  const scheduleConcept = (patch: { name?: string; description?: string }) => {
    pending.current = { ...pending.current, ...patch };
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => flushConceptRef.current(), 650);
  };

  const counts = NODE_TYPE_ORDER.map((type) => ({
    type,
    count: concept.nodes.filter((node) => node.type === type).length,
  })).filter((item) => item.count > 0);

  return (
    <div className="inspector">
      <div className="inspector__header">
        <span className="inspector__badge" style={{ color: concept.color, background: `${concept.color}1f` }}>
          <Icon name="layers" size={13} />
          Концепция
        </span>
        <span className="inspector__spacer" />
        <button className="icon-btn icon-btn--sm" title="Открыть ИИ-ассистента" onClick={() => setRightTab('ai')}>
          <Icon name="sparkles" size={14} />
        </button>
      </div>

      <Field label="Название концепции">
        <input
          className="input"
          value={draft.name}
          onChange={(event) => {
            const value = event.target.value;
            setDraft((current) => ({ ...current, name: value }));
            scheduleConcept({ name: value });
          }}
          onBlur={flushConcept}
        />
      </Field>

      <Field label="Описание" hint="зачем эта концепция">
        <AutoTextarea
          className="textarea textarea--auto"
          rows={2}
          maxHeight={240}
          value={draft.description}
          onChange={(event) => {
            const value = event.target.value;
            setDraft((current) => ({ ...current, description: value }));
            scheduleConcept({ description: value });
          }}
          onBlur={flushConcept}
          placeholder="Что мы пытаемся понять в этом графе"
        />
      </Field>

      <div className="field">
        <span className="field__label">Цвет</span>
        <div className="swatches">
          {CONCEPT_COLORS.map((color) => (
            <button
              key={color}
              className={`swatch ${concept.color === color ? 'is-active' : ''}`}
              style={{ background: color }}
              title={color}
              onClick={() => void updateConcept(concept.id, { color })}
            />
          ))}
        </div>
      </div>

      <section className="inspector__section">
        <div className="inspector__section-head">
          <span>Сводка</span>
        </div>
        <div className="stat-grid">
          <div className="stat">
            <strong>{concept.nodes.length}</strong>
            <span>узлов</span>
          </div>
          <div className="stat">
            <strong>{concept.edges.length}</strong>
            <span>связей</span>
          </div>
          <div className="stat">
            <strong>{concept.nodes.filter((node) => node.status === 'active').length}</strong>
            <span>в работе</span>
          </div>
        </div>
        <div className="type-stats">
          {counts.map((item) => (
            <span key={item.type} className="type-stat" style={{ color: NODE_META[item.type].color }}>
              <Icon name={NODE_META[item.type].icon} size={12} />
              {item.count}
            </span>
          ))}
        </div>
      </section>


      <section className="inspector__section">
        <div className="inspector__section-head">
          <span>Проект</span>
        </div>
        <input
          className="input"
          value={projectName}
          onChange={(event) => setProjectName(event.target.value)}
          onBlur={() => {
            if (projectId && projectName.trim() && projectName !== project.name) {
              void updateProject(projectId, { name: projectName.trim() });
            }
          }}
        />
        <p className="muted-copy">
          {project.concepts.length} {plural(project.concepts.length, 'концепция', 'концепции', 'концепций')}
          {project.description ? ` · ${project.description}` : ''}
        </p>
      </section>

      <div className="inspector__section">
        <div className="meta-row">
          <span>ID концепции</span>
          <CopyId value={concept.id} />
        </div>
      </div>

      <div className="danger-zone">
        <ConfirmButton label="Удалить концепцию" confirmLabel="Удалить концепцию" onConfirm={() => void deleteConcept(concept.id)} />
        <ConfirmButton label="Удалить проект" confirmLabel="Удалить проект целиком" onConfirm={() => void deleteProject(project.id)} />
      </div>
    </div>
  );
}

export function Inspector() {
  const concept = useActiveConcept();
  const selectedNodeId = useAppStore((state) => state.selectedNodeId);
  const selectedEdgeId = useAppStore((state) => state.selectedEdgeId);
  const node = concept?.nodes.find((item) => item.id === selectedNodeId) ?? null;
  const edge = concept?.edges.find((item) => item.id === selectedEdgeId) ?? null;

  if (node) return <NodeInspector key={node.id} node={node} />;
  if (edge) return <EdgeInspector key={edge.id} edge={edge} />;
  return <ConceptInspector key={concept?.id ?? 'none'} />;
}
