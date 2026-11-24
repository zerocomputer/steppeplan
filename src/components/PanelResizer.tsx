import { useRef } from 'react';

interface PanelResizerProps {
  side: 'left' | 'right';
  width: number;
  min: number;
  max: number;
  defaultValue: number;
  onChange: (width: number) => void;
}

function cssUiScale() {
  const value = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--ui-scale') || '1',
  );
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export function PanelResizer({ side, width, min, max, defaultValue, onChange }: PanelResizerProps) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  return (
    <div
      className={`panel-resizer panel-resizer--${side}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={side === 'left' ? 'Ширина навигации' : 'Ширина инспектора'}
      title="Потяните, чтобы изменить ширину · двойной клик — сброс"
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        drag.current = { startX: event.clientX, startWidth: width };
        event.currentTarget.classList.add('is-dragging');
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        event.preventDefault();
        const delta = (event.clientX - drag.current.startX) / cssUiScale();
        const next = side === 'left' ? drag.current.startWidth + delta : drag.current.startWidth - delta;
        onChange(Math.min(max, Math.max(min, Math.round(next))));
      }}
      onPointerUp={(event) => {
        if (!drag.current) return;
        drag.current = null;
        event.currentTarget.classList.remove('is-dragging');
      }}
      onPointerCancel={(event) => {
        drag.current = null;
        event.currentTarget.classList.remove('is-dragging');
      }}
      onDoubleClick={() => onChange(defaultValue)}
    />
  );
}
