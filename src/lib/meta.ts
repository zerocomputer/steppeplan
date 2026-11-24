import type { EdgeKind, NodeStatus, NodeType } from '../types';
import type { IconName } from '../components/Icons';

export const NODE_META: Record<
  NodeType,
  { label: string; color: string; icon: IconName; hint: string }
> = {
  concept: { label: 'Концепт', color: '#A259FF', icon: 'sparkles', hint: 'Идея, сущность или ветка смысла' },
  question: { label: 'Вопрос', color: '#FFCD29', icon: 'help', hint: 'Открытый вопрос, который важно решить' },
  decision: { label: 'Решение', color: '#0D99FF', icon: 'check', hint: 'Зафиксированный выбор и его основание' },
  task: { label: 'Задача', color: '#14AE5C', icon: 'task', hint: 'Действие, которое двигает проект' },
  risk: { label: 'Риск', color: '#F24822', icon: 'alert', hint: 'Угроза, ограничение или цена решения' },
  source: { label: 'Знание', color: '#1BC5BD', icon: 'book', hint: 'Факт, ссылка, исследование, знание' },
  note: { label: 'Заметка', color: '#9B9BA3', icon: 'note', hint: 'Свободная мысль без строгого типа' },
  table: { label: 'Таблица', color: '#FFA629', icon: 'grid', hint: 'Данные в строках и колонках — модель, матрица или справочник' },
};

export const NODE_TYPE_ORDER: NodeType[] = [
  'concept',
  'question',
  'decision',
  'task',
  'risk',
  'source',
  'note',
  'table',
];

export const STATUS_META: Record<NodeStatus, { label: string; color: string }> = {
  open: { label: 'Открыт', color: '#FFCD29' },
  active: { label: 'В работе', color: '#0D99FF' },
  done: { label: 'Готово', color: '#14AE5C' },
  parked: { label: 'Отложен', color: '#8B8B95' },
};

export const EDGE_META: Record<
  EdgeKind,
  { label: string; short: string; color: string; dash?: string }
> = {
  supports: { label: 'поддерживает', short: 'поддерживает', color: '#14AE5C' },
  depends: { label: 'зависит от', short: 'зависит', color: '#FFCD29' },
  refines: { label: 'уточняет', short: 'уточняет', color: '#0D99FF' },
  contradicts: { label: 'противоречит', short: 'противоречит', color: '#F24822' },
  relates: { label: 'связано', short: 'связано', color: '#8B8B95' },
};

export const EDGE_KINDS: EdgeKind[] = ['supports', 'depends', 'refines', 'contradicts', 'relates'];

export const ORIGIN_LABEL: Record<string, string> = {
  human: 'вручную',
  ai: 'ИИ',
  mcp: 'MCP-агент',
  seed: 'пример',
};

export const CONCEPT_COLORS = ['#9747FF', '#0D99FF', '#14AE5C', '#F24822', '#FFCD29', '#1BC5BD'];

const DEFAULT_TITLES: Record<NodeType, string> = {
  concept: 'Новый концепт',
  question: 'Новый вопрос',
  decision: 'Новое решение',
  task: 'Новая задача',
  risk: 'Новый риск',
  source: 'Новое знание',
  note: 'Новая заметка',
  table: 'Новая таблица',
};

export function defaultNodeTitle(type: NodeType): string {
  return DEFAULT_TITLES[type];
}
