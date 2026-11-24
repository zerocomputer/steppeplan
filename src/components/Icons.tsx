import type { CSSProperties, ReactNode } from 'react';

export type IconName =
  | 'sparkles'
  | 'help'
  | 'check'
  | 'task'
  | 'alert'
  | 'book'
  | 'note'
  | 'plus'
  | 'search'
  | 'settings'
  | 'sun'
  | 'moon'
  | 'chevron-down'
  | 'chevron-right'
  | 'arrow-up'
  | 'close'
  | 'trash'
  | 'copy'
  | 'layout'
  | 'grid'
  | 'fit'
  | 'zoom-in'
  | 'zoom-out'
  | 'link'
  | 'lock'
  | 'message'
  | 'layers'
  | 'panel'
  | 'dots'
  | 'cloud'
  | 'brain'
  | 'folder'
  | 'route'
  | 'check-circle';

const paths: Record<IconName, ReactNode> = {
  sparkles: (
    <>
      <path d="M12 3.5l1.6 4.1L17.7 9l-4.1 1.6L12 14.7l-1.6-4.1L6.3 9l4.1-1.4L12 3.5z" />
      <path d="M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" />
      <path d="M5 15.5l.6 1.6 1.6.6-1.6.6L5 20l-.6-1.7-1.6-.6 1.6-.6L5 15.5z" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.4 9.2a2.7 2.7 0 1 1 4 2.4c-.9.5-1.4 1.1-1.4 2.2" />
      <path d="M12 17.2h.01" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.4 12.3l2.4 2.4 4.8-5" />
    </>
  ),
  task: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <path d="M8 12.2l2.5 2.5 5-5.2" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.8l8.6 15H3.4L12 3.8z" />
      <path d="M12 9.5v4.2" />
      <path d="M12 16.8h.01" />
    </>
  ),
  book: (
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16z" />
      <path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20" />
      <path d="M8 7.5h8" />
    </>
  ),
  note: (
    <>
      <path d="M5 4.5h14a1 1 0 0 1 1 1v8.3l-5.7 5.7H5a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1z" />
      <path d="M14.3 19.5V14h5.5" />
      <path d="M8 9h6M8 12.5h4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.4 1z" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
    </>
  ),
  moon: <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2z" />,
  'chevron-down': <path d="M6 9l6 6 6-6" />,
  'chevron-right': <path d="M9 6l6 6-6 6" />,
  'arrow-up': <path d="M12 19V5M6 11l6-6 6 6" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  trash: (
    <>
      <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" />
      <path d="M10 11v5M14 11v5" />
    </>
  ),
  copy: (
    <>
      <rect x="8.5" y="8.5" width="12" height="12" rx="2.5" />
      <path d="M15.5 5.5A2 2 0 0 0 13.5 3.5h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2" />
    </>
  ),
  layout: (
    <>
      <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.8" />
      <rect x="14" y="3.5" width="6.5" height="6.5" rx="1.8" />
      <rect x="8.8" y="14" width="6.5" height="6.5" rx="1.8" />
      <path d="M6.8 10v2.2h10.4V10M12 12.2V14" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="6.2" height="6.2" rx="1.4" />
      <rect x="13.8" y="4" width="6.2" height="6.2" rx="1.4" />
      <rect x="4" y="13.8" width="6.2" height="6.2" rx="1.4" />
      <rect x="13.8" y="13.8" width="6.2" height="6.2" rx="1.4" />
    </>
  ),
  fit: <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" />,
  'zoom-in': (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5M8 11h6M11 8v6" />
    </>
  ),
  'zoom-out': (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5M8 11h6" />
    </>
  ),
  link: (
    <>
      <path d="M10 13.8a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 1 0-5.7-5.7L11.4 6.7" />
      <path d="M14 10.2a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 1 0 5.7 5.7l1.2-1.2" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10" width="15" height="10.5" rx="2.8" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
    </>
  ),
  message: (
    <>
      <path d="M20.5 11.5a7.7 7.7 0 0 1-8 7.7 9 9 0 0 1-3-.5L4.5 20.5l1.8-4.6a7.4 7.4 0 0 1-1-3.9 7.7 7.7 0 0 1 8-7.5 7.7 7.7 0 0 1 7.2 7z" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3.5l9 4.7-9 4.7-9-4.7 9-4.7z" />
      <path d="M3 12.4l9 4.7 9-4.7M3 16.9l9 4.6 9-4.6" />
    </>
  ),
  panel: (
    <>
      <rect x="3.5" y="4" width="17" height="16" rx="3" />
      <path d="M14.5 4v16" />
    </>
  ),
  dots: (
    <>
      <circle cx="5.5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="18.5" cy="12" r="1" />
    </>
  ),
  cloud: <path d="M7 18.5a4.5 4.5 0 0 1-.7-8.95 5.5 5.5 0 0 1 10.7-1.2A4 4 0 0 1 17.5 18.5H7z" />,
  brain: (
    <>
      <path d="M9.5 4.5a3 3 0 0 0-3 3 2.8 2.8 0 0 0-1.4 4.9A3 3 0 0 0 7 17.8a2.7 2.7 0 0 0 5 0V6.5a3 3 0 0 0-2.5-2z" />
      <path d="M14.5 4.5a3 3 0 0 1 3 3 2.8 2.8 0 0 1 1.4 4.9 3 3 0 0 1-1.9 5.4 2.7 2.7 0 0 1-5 0" />
    </>
  ),
  folder: (
    <>
      <path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h4l2 2.5h6A2.5 2.5 0 0 1 20.5 10v7A2.5 2.5 0 0 1 18 19.5H6A2.5 2.5 0 0 1 3.5 17v-9.5z" />
    </>
  ),
  route: (
    <>
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <path d="M8.5 18H14a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.5" />
    </>
  ),
  'check-circle': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.2 12.2l2.6 2.6 5-5.2" />
    </>
  ),
};

interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
}

export function Icon({ name, size = 16, strokeWidth = 1.8, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
