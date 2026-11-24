import { Handle, NodeResizer, Position, type NodeProps, type Node } from '@xyflow/react';
import { useEffect, useState, type CSSProperties } from 'react';
import type { PlanNode } from '../types';
import { NODE_META, STATUS_META } from '../lib/meta';
import { Icon } from './Icons';

export type PlanNodeData = {
  node: PlanNode;
  degree: number;
  onResize?: (id: string, width: number, height: number) => void;
};

export type PlanFlowNode = Node<PlanNodeData, 'plan'>;

export function PlanNodeCard({ data, selected }: NodeProps<PlanFlowNode>) {
  const { node, degree, onResize } = data;
  const meta = NODE_META[node.type];
  const status = STATUS_META[node.status];
  const isAgent = node.origin === 'ai' || node.origin === 'mcp';
  const [size, setSize] = useState<{ width?: number; height?: number }>({
    width: node.width,
    height: node.height,
  });

  useEffect(() => {
    setSize({ width: node.width, height: node.height });
  }, [node.id, node.width, node.height]);

  const isTall = Boolean(size.height && size.height > 230);
  const isSized = Boolean(size.width || size.height);
  const cardWidth = size.width ?? (node.type === 'table' ? 360 : 252);
  const table = node.table;
  const isTable = node.type === 'table' && Boolean(table);
  const visibleRows = table?.rows.slice(0, isTall ? 10 : 4) ?? [];

  // Tags are not hard-capped at two. Estimate how many fit into the current
  // card width and show the rest as +N (the tooltip lists all of them).
  const tagBudget = Math.max(36, cardWidth - 112);
  let tagWidthUsed = 0;
  const visibleTags: string[] = [];
  for (let index = 0; index < node.tags.length; index += 1) {
    const tag = node.tags[index];
    const estimated = Math.min(70, Math.max(28, Math.min(tag.length, 11) * 5 + 12));
    const reserveMore = index < node.tags.length - 1 ? 22 : 0;
    if (tagWidthUsed + estimated + 5 + reserveMore > tagBudget) break;
    visibleTags.push(tag);
    tagWidthUsed += estimated + 5;
  }
  const hiddenTags = node.tags.slice(visibleTags.length);

  return (
    <div
      className={`plan-node ${selected ? 'is-selected' : ''} ${node.status === 'done' ? 'is-done' : ''} ${isTall ? 'is-tall' : ''} ${isSized ? 'is-sized' : ''} ${isTable ? 'plan-node--table' : ''}`}
      style={
        {
          '--node-accent': meta.color,
          width: size.width ?? (isTable ? 360 : undefined),
          height: size.height ?? undefined,
        } as CSSProperties
      }
    >
      <NodeResizer
        isVisible={Boolean(selected)}
        color={meta.color}
        minWidth={220}
        minHeight={150}
        maxWidth={720}
        maxHeight={720}
        onResize={(_event, params) => setSize({ width: params.width, height: params.height })}
        onResizeEnd={(_event, params) => {
          setSize({ width: params.width, height: params.height });
          onResize?.(node.id, params.width, params.height);
        }}
      />
      <Handle type="target" position={Position.Left} className="plan-handle plan-handle--target" />
      <div className="plan-node__head">
        <span className="plan-node__icon">
          <Icon name={meta.icon} size={14} />
        </span>
        <div className="plan-node__heading">
          <span className="plan-node__type">{meta.label}</span>
          <span className="plan-node__title">{node.title}</span>
        </div>
        {isAgent && (
          <span className={`origin-badge origin-badge--${node.origin}`} title={node.origin === 'mcp' ? 'Создано MCP-агентом' : 'Создано ИИ'}>
            {node.origin === 'mcp' ? 'MCP' : <Icon name="sparkles" size={11} />}
          </span>
        )}
      </div>

      <div className="plan-node__body">
      {isTable && table ? (
        <div className="plan-table">
          <table>
            <thead>
              <tr>
                {table.columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {table.columns.map((_, columnIndex) => (
                    <td key={columnIndex}>{row[columnIndex] || '—'}</td>
                  ))}
                </tr>
              ))}
              {!visibleRows.length && (
                <tr>
                  <td colSpan={table.columns.length} className="plan-table__empty">
                    Пустая таблица
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {table.rows.length > visibleRows.length && (
            <span className="plan-table__more">+{table.rows.length - visibleRows.length} строк</span>
          )}
        </div>
      ) : node.summary ? (
        <p className="plan-node__summary">{node.summary}</p>
      ) : (
        <p className="plan-node__summary plan-node__summary--empty">Без описания</p>
      )}
      {isTable && node.summary && <p className="plan-node__summary plan-node__summary--table-caption">{node.summary}</p>}
      </div>

      <div className="plan-node__footer">
        <span className="status-pill" style={{ color: status.color }}>
          <span className="status-pill__dot" style={{ background: status.color }} />
          {status.label}
        </span>
        {visibleTags.map((tag) => (
          <span key={tag} className="node-tag">
            {tag}
          </span>
        ))}
        {hiddenTags.length > 0 && (
          <span className="node-tag node-tag--more" title={hiddenTags.join(', ')}>
            +{hiddenTags.length}
          </span>
        )}
        <span className="plan-node__spacer" />
        <span className="plan-node__degree" title="Связей">
          <Icon name="link" size={11} />
          {degree}
        </span>
      </div>

      <Handle type="source" position={Position.Right} className="plan-handle plan-handle--source" />
    </div>
  );
}
