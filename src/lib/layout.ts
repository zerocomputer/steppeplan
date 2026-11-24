import dagre from '@dagrejs/dagre';
import type { PlanEdge, PlanNode } from '../types';

const NODE_WIDTH = 252;
const NODE_HEIGHT = 148;

export interface LayoutSize {
  width: number;
  height: number;
}

function nodeSize(node: PlanNode, sizes?: Record<string, LayoutSize>): LayoutSize {
  const measured = sizes?.[node.id];
  return {
    width: node.width ?? measured?.width ?? (node.type === 'table' ? 360 : NODE_WIDTH),
    height: node.height ?? measured?.height ?? NODE_HEIGHT,
  };
}

export function layoutGraph(
  nodes: PlanNode[],
  edges: PlanEdge[],
  sizes?: Record<string, LayoutSize>,
): Array<{ id: string; x: number; y: number }> {
  if (!nodes.length) return [];
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    // Keep the original compact left-to-right rhythm. The only change is that
    // measured card sizes are respected so resized nodes cannot overlap.
    rankdir: 'LR',
    nodesep: 54,
    ranksep: 128,
    edgesep: 24,
    marginx: 40,
    marginy: 40,
    align: 'UL',
  });
  for (const node of nodes) {
    graph.setNode(node.id, nodeSize(node, sizes));
  }
  for (const edge of edges) {
    graph.setEdge(edge.source, edge.target);
  }
  dagre.layout(graph);
  return nodes.map((node) => {
    const point = graph.node(node.id);
    const { width, height } = nodeSize(node, sizes);
    return {
      id: node.id,
      x: Math.round(point.x - width / 2),
      y: Math.round(point.y - height / 2),
    };
  });
}


/**
 * Compact, readable fallback for small boards: keep the logical order from
 * Dagre, then pack nodes into a grid instead of stretching into a wide chain.
 */
export function layoutGrid(
  nodes: PlanNode[],
  edges: PlanEdge[],
  sizes?: Record<string, LayoutSize>,
): Array<{ id: string; x: number; y: number }> {
  if (!nodes.length) return [];
  const hierarchy = new Map(layoutGraph(nodes, edges, sizes).map((position) => [position.id, position]));
  const typeOrder = ['concept', 'source', 'question', 'risk', 'decision', 'task', 'note'];
  const ordered = [...nodes].sort((a, b) => {
    const ax = hierarchy.get(a.id)?.x ?? 0;
    const bx = hierarchy.get(b.id)?.x ?? 0;
    if (Math.abs(ax - bx) > 40) return ax - bx;
    const typeDelta = typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type);
    if (typeDelta !== 0) return typeDelta;
    return a.title.localeCompare(b.title, 'ru');
  });

  const columns = Math.max(2, Math.ceil(Math.sqrt(ordered.length * 0.9)));
  const rows: PlanNode[][] = [];
  for (let index = 0; index < ordered.length; index += columns) {
    rows.push(ordered.slice(index, index + columns));
  }
  const widthOf = (node: PlanNode) => nodeSize(node, sizes).width;
  const heightOf = (node: PlanNode) => nodeSize(node, sizes).height;
  const columnWidths = Array.from({ length: columns }, (_, column) =>
    Math.max(0, ...rows.map((row) => (row[column] ? widthOf(row[column]) : 0))),
  );
  const rowHeights = rows.map((row) => Math.max(0, ...row.map(heightOf)));
  const x: number[] = [];
  let cursorX = 0;
  for (let column = 0; column < columns; column += 1) {
    x.push(cursorX);
    cursorX += columnWidths[column] + 80;
  }
  const y: number[] = [];
  let cursorY = 0;
  for (let row = 0; row < rows.length; row += 1) {
    y.push(cursorY);
    cursorY += rowHeights[row] + 70;
  }

  return ordered.map((node, index) => ({
    id: node.id,
    x: Math.round(x[index % columns]),
    y: Math.round(y[Math.floor(index / columns)]),
  }));
}
