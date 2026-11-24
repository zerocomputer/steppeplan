import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';

interface AutoTextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'rows'> {
  rows?: number;
  maxHeight?: number;
}

/**
 * A textarea that grows with its content instead of showing an inner scrollbar
 * until it reaches maxHeight. Used in the inspector and the AI composer.
 */
export function AutoTextarea({ rows = 2, maxHeight = 280, ...props }: AutoTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const resize = () => {
      element.style.height = 'auto';
      const next = Math.min(element.scrollHeight, maxHeight);
      element.style.height = `${next}px`;
      element.style.overflowY = element.scrollHeight > maxHeight ? 'auto' : 'hidden';
      element.style.overflowX = 'hidden';
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [props.value, maxHeight]);

  return <textarea ref={ref} rows={rows} wrap="soft" {...props} />;
}
