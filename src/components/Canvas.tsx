import { useEffect, useRef, type CSSProperties } from 'react';
import {
  Background,
  MarkerType,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type EdgeTypes,
  type FinalConnectionState,
  type NodeTypes,
  type Viewport,
} from '@xyflow/react';
import { useActiveConcept, useAppStore } from '../store';
import { EDGE_META, NODE_META, NODE_TYPE_ORDER, defaultNodeTitle } from '../lib/meta';
import { layoutGraph, layoutGrid } from '../lib/layout';
import { PlanNodeCard, type PlanFlowNode } from './PlanNode';
import { RelationEdge, type RelationFlowEdge } from './RelationEdge';
import { Icon } from './Icons';

const nodeTypes = { plan: PlanNodeCard } satisfies NodeTypes;
const edgeTypes = { relation: RelationEdge } satisfies EdgeTypes;

export function Canvas() {
  const concept = useActiveConcept();
  const theme = useAppStore((state) => state.theme);
  const selectNode = useAppStore((state) => state.selectNode);
  const selectEdge = useAppStore((state) => state.selectEdge);
  const addNode = useAppStore((state) => state.addNode);
  const addEdge = useAppStore((state) => state.addEdge);
  const updateNode = useAppStore((state) => state.updateNode);
  const savePositions = useAppStore((state) => state.savePositions);
  const saveViewport = useAppStore((state) => state.saveViewport);
  const focusRequest = useAppStore((state) => state.focusRequest);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const viewportTimer = useRef<number | undefined>(undefined);
  const lastConceptId = useRef<string | null>(null);
  const lastPaneClick = useRef<{ at: number; x: number; y: number }>({ at: 0, x: 0, y: 0 });

  const { screenToFlowPosition, setViewport, fitView, zoomIn, zoomOut } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<PlanFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<RelationFlowEdge>([]);

  const conceptId = concept?.id ?? null;

  useEffect(() => {
    if (!concept) {
      setNodes([]);
      setEdges([]);
      return;
    }
    const degree = new Map<string, number>();
    for (const edge of concept.edges) {
      degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
      degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    }
    // Read selection from the store snapshot instead of subscribing to it:
    // driving React Flow's `selected` prop from every store change causes
    // selection-change feedback loops.
    const { selectedNodeId: activeNode, selectedEdgeId: activeEdge } = useAppStore.getState();
    setNodes(
      concept.nodes.map((node) => ({
        id: node.id,
        type: 'plan' as const,
        position: { x: node.x, y: node.y },
        data: {
          node,
          degree: degree.get(node.id) ?? 0,
          onResize: (id, width, height) => {
            void updateNode(id, { width: Math.round(width), height: Math.round(height) });
          },
        },
        selected: node.id === activeNode,
      })),
    );
    setEdges(
      concept.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'relation' as const,
        data: { kind: edge.kind, label: edge.label, lane: edge.lane ?? 0 },
        selected: edge.id === activeEdge,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: EDGE_META[edge.kind].color,
          width: 16,
          height: 16,
        },
      })),
    );
  }, [concept, setNodes, setEdges, updateNode]);

  useEffect(() => {
    if (!concept || lastConceptId.current === concept.id) return;
    lastConceptId.current = concept.id;
    const viewport = concept.viewport ?? { x: 0, y: 0, zoom: 1 };
    const timer = window.setTimeout(() => {
      void setViewport(viewport, { duration: 0 });
    }, 40);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conceptId, setViewport]);

  useEffect(() => {
    if (!focusRequest) return;
    setNodes((current) =>
      current.map((node) =>
        node.selected === (node.id === focusRequest.nodeId)
          ? node
          : { ...node, selected: node.id === focusRequest.nodeId },
      ),
    );
    setEdges((current) =>
      current.map((edge) => (edge.selected ? { ...edge, selected: false } : edge)),
    );
    // The node may have been added in the same commit; let React Flow register
    // it before asking it to fit the viewport to it.
    const timer = window.setTimeout(() => {
      const ids = focusRequest.nodeIds?.length ? focusRequest.nodeIds : [focusRequest.nodeId];
      void fitView({
        nodes: ids.map((id) => ({ id })),
        padding: 0.35,
        duration: 420,
        maxZoom: 1.05,
      });
    }, 140);
    return () => window.clearTimeout(timer);
  }, [focusRequest, fitView, setNodes, setEdges]);

  const addNodeAt = (type: keyof typeof NODE_META, point?: { x: number; y: number }) => {
    if (!concept) return;
    const rect = wrapperRef.current?.getBoundingClientRect();
    const screenPoint =
      point ??
      ({
        x: (rect?.left ?? 0) + (rect?.width ?? 900) / 2,
        y: (rect?.top ?? 0) + (rect?.height ?? 700) / 2,
      } as { x: number; y: number });
    const flowPoint = screenToFlowPosition(screenPoint);
    const jitter = (concept.nodes.length % 4) * 16;
    void addNode(concept.id, {
      type,
      title: defaultNodeTitle(type),
      position: { x: flowPoint.x - 126 + jitter, y: flowPoint.y - 72 + jitter },
    });
  };

  const handlePaneClick = (event: React.MouseEvent) => {
    const now = Date.now();
    const distance = Math.hypot(event.clientX - lastPaneClick.current.x, event.clientY - lastPaneClick.current.y);
    if (now - lastPaneClick.current.at < 320 && distance < 10) {
      lastPaneClick.current = { at: 0, x: 0, y: 0 };
      addNodeAt('concept', { x: event.clientX, y: event.clientY });
      return;
    }
    lastPaneClick.current = { at: now, x: event.clientX, y: event.clientY };
    selectNode(null);
  };

  const handleConnect = (connection: Connection) => {
    if (!concept || !connection.source || !connection.target) return;
    void addEdge(concept.id, connection.source, connection.target, 'relates');
  };

  // Dropping the connection line on a node (not exactly on its tiny handle)
  // still connects: people aim at cards, not at ports.
  const handleConnectEnd = (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
    if (!concept || state.isValid || !state.fromNode) return;
    const point = 'changedTouches' in event ? event.changedTouches[0] : event;
    if (!point) return;
    const element = document.elementFromPoint(point.clientX, point.clientY);
    const nodeElement = element?.closest('.react-flow__node') as HTMLElement | null;
    const targetId = nodeElement?.getAttribute('data-id');
    if (!targetId || targetId === state.fromNode.id) return;
    void addEdge(concept.id, state.fromNode.id, targetId, 'relates');
  };

  const handleDragStop = () => {
    if (!concept) return;
    void savePositions(
      concept.id,
      nodes.map((node) => ({ id: node.id, x: node.position.x, y: node.position.y })),
    );
  };

  const handleMoveEnd = (_event: unknown, viewport: Viewport) => {
    if (!concept) return;
    window.clearTimeout(viewportTimer.current);
    viewportTimer.current = window.setTimeout(() => {
      void saveViewport(concept.id, viewport);
    }, 700);
  };

  const runLayout = (mode: 'hierarchy' | 'grid' = 'hierarchy') => {
    if (!concept || concept.nodes.length < 2) return;
    const sizes = Object.fromEntries(
      nodes.map((node) => [
        node.id,
        {
          width: node.measured?.width ?? node.width ?? (node.data.node.type === 'table' ? 360 : 252),
          height: node.measured?.height ?? node.height ?? 148,
        },
      ]),
    );
    const positions =
      mode === 'grid'
        ? layoutGrid(concept.nodes, concept.edges, sizes)
        : layoutGraph(concept.nodes, concept.edges, sizes);
    void savePositions(concept.id, positions).then(() => {
      window.setTimeout(() => {
        void fitView({ padding: 0.16, duration: 500 });
      }, 140);
    });
  };

  if (!concept) {
    return (
      <main className="canvas-card">
        <div className="canvas-empty">
          <span className="canvas-empty__icon">
            <Icon name="layers" size={22} />
          </span>
          <h2>Выберите концепцию</h2>
          <p>Слева — проекты и их концепции. Каждая концепция хранит свой граф.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="canvas-card" ref={wrapperRef}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={handleDragStop}
        onConnect={handleConnect}
        onConnectEnd={handleConnectEnd}
        onNodeClick={(_event, node) => selectNode(node.id)}
        onEdgeClick={(_event, edge) => selectEdge(edge.id)}
        onPaneClick={handlePaneClick}
        onMoveEnd={handleMoveEnd}
        colorMode={theme}
        fitView={false}
        minZoom={0.15}
        maxZoom={1.85}
        deleteKeyCode={null}
        zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: true }}
        connectionLineStyle={{ stroke: 'var(--accent)', strokeWidth: 1.8 }}
        connectionRadius={28}
      >
        <Background gap={22} size={1.15} color="var(--rf-dot)" />
      </ReactFlow>

      {concept.nodes.length > 0 && (
        <div className="canvas-meta">
          <span className="canvas-meta__dot" style={{ background: concept.color }} />
          <strong>{concept.name}</strong>
          <span className="canvas-meta__sep" />
          {concept.nodes.length} узлов · {concept.edges.length} связей
        </div>
      )}

      <div className="canvas-toolbar">
        <span className="canvas-toolbar__label">Добавить</span>
        <div className="canvas-toolbar__types">
          {NODE_TYPE_ORDER.map((type) => (
            <button
              key={type}
              className="tool-btn"
              style={{ '--tool-color': NODE_META[type].color } as CSSProperties}
              title={`${NODE_META[type].label} — ${NODE_META[type].hint}`}
              onClick={() => addNodeAt(type)}
            >
              <Icon name={NODE_META[type].icon} size={15} />
            </button>
          ))}
        </div>
        <span className="canvas-toolbar__divider" />
        <button className="tool-btn tool-btn--wide" title="Иерархическая авто-раскладка (как раньше)" onClick={() => runLayout('hierarchy')}>
          <Icon name="layout" size={15} />
        </button>
        <button className="tool-btn tool-btn--wide" title="Компактная сетка — читаемая раскладка в несколько колонок" onClick={() => runLayout('grid')}>
          <Icon name="grid" size={15} />
        </button>
        <button className="tool-btn tool-btn--wide" title="Показать весь граф" onClick={() => void fitView({ padding: 0.22, duration: 400 })}>
          <Icon name="fit" size={15} />
        </button>
      </div>

      <div className="canvas-zoom">
        <button onClick={() => void zoomIn({ duration: 160 })} title="Приблизить">
          <Icon name="zoom-in" size={15} />
        </button>
        <button onClick={() => void zoomOut({ duration: 160 })} title="Отдалить">
          <Icon name="zoom-out" size={15} />
        </button>
        <span className="canvas-zoom__sep" />
        <button onClick={() => void fitView({ padding: 0.22, duration: 350 })} title="Показать весь граф">
          <Icon name="fit" size={15} />
        </button>
      </div>

      {!concept.nodes.length && (
        <div className="canvas-empty canvas-empty--overlay">
          <span className="canvas-empty__icon">
            <Icon name="sparkles" size={22} />
          </span>
          <h2>Пустая концепция</h2>
          <p>Добавьте первый узел или дважды кликните по холсту.</p>
          <div className="canvas-empty__actions">
            {(['concept', 'question', 'task'] as const).map((type) => (
              <button key={type} className="btn btn--soft" onClick={() => addNodeAt(type)}>
                <span style={{ color: NODE_META[type].color }}>
                  <Icon name={NODE_META[type].icon} size={14} />
                </span>
                {NODE_META[type].label}
              </button>
            ))}
          </div>
        </div>
      )}

      {concept.nodes.length > 0 && (
        <div className="canvas-hint">
          Двойной клик — узел · Потяните за точку справа — связь · Delete — удалить
        </div>
      )}
    </main>
  );
}
