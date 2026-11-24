import {
  BaseEdge,
  EdgeLabelRenderer,
  useReactFlow,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { EdgeKind } from '../types';
import { EDGE_META } from '../lib/meta';
import { useAppStore } from '../store';

export type RelationEdgeData = {
  kind: EdgeKind;
  label: string;
  lane?: number;
};

export type RelationFlowEdge = Edge<RelationEdgeData, 'relation'>;

/**
 * Orthogonal edge with a draggable horizontal "lane". The lane lets people
 * pull a single line up or down to untangle it from neighbouring connections,
 * without moving the nodes themselves.
 */
export function RelationEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  data,
  selected,
}: EdgeProps<RelationFlowEdge>) {
  const kind = data?.kind ?? 'relates';
  const meta = EDGE_META[kind];
  const updateEdge = useAppStore((state) => state.updateEdge);
  const { getZoom } = useReactFlow();

  const [lane, setLane] = useState<number>(data?.lane ?? 0);
  const laneRef = useRef(lane);
  const drag = useRef<{ startY: number; startLane: number } | null>(null);

  useEffect(() => {
    if (!drag.current) {
      setLane(data?.lane ?? 0);
      laneRef.current = data?.lane ?? 0;
    }
  }, [data?.lane]);

  const midX = (sourceX + targetX) / 2;
  const laneY = (sourceY + targetY) / 2 + lane;
  // At lane=0 the two x points coincide with the midpoint, reproducing the
  // original compact orthogonal route. As the lane is pulled, a horizontal
  // segment opens up around the midpoint.
  const spread = Math.min(72, Math.abs(lane) * 0.9);
  const left = midX - spread;
  const right = midX + spread;
  const path = `M ${sourceX} ${sourceY} L ${left} ${sourceY} L ${left} ${laneY} L ${right} ${laneY} L ${right} ${targetY} L ${targetX} ${targetY}`;
  const label = data?.label || meta.short;
  const hideLabel = !data?.label && (kind === 'supports' || kind === 'relates') && !selected;

  const startDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    drag.current = { startY: event.clientY, startLane: laneRef.current };
  };

  const moveDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!drag.current) return;
    event.preventDefault();
    event.stopPropagation();
    const cssScale = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--ui-scale') || '1',
    );
    const scale = Math.max(0.1, getZoom() * (Number.isFinite(cssScale) && cssScale > 0 ? cssScale : 1));
    const next = Math.max(-800, Math.min(800, drag.current.startLane + (event.clientY - drag.current.startY) / scale));
    laneRef.current = next;
    setLane(next);
  };

  const endDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!drag.current) return;
    event.preventDefault();
    event.stopPropagation();
    drag.current = null;
    void updateEdge(id, { lane: Math.round(laneRef.current) });
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        interactionWidth={34}
        style={{
          stroke: meta.color,
          strokeWidth: selected ? 2.2 : 1.35,
          strokeDasharray: kind === 'contradicts' ? '5 4' : undefined,
          opacity: selected ? 1 : 0.72,
        }}
      />
      <EdgeLabelRenderer>
        {!hideLabel && (
          <div
            className={`relation-label ${selected ? 'is-selected' : ''} ${kind === 'relates' ? 'is-muted' : ''}`}
            style={
              {
                transform: `translate(-50%, -50%) translate(${midX}px, ${laneY - (selected ? 16 : 0)}px)`,
                color: meta.color,
                '--edge-color': meta.color,
              } as CSSProperties
            }
          >
            {label}
          </div>
        )}
        {selected && (
          <button
            className="edge-lane-handle"
            style={
              {
                transform: `translate(-50%, -50%) translate(${midX}px, ${laneY}px)`,
                borderColor: meta.color,
              } as CSSProperties
            }
            title="Потяните вверх или вниз, чтобы развести связи"
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <span />
          </button>
        )}
      </EdgeLabelRenderer>
    </>
  );
}
