import type { ReactNode } from 'react';

const paths = {
  home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" /></>,
  commercial: <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12a23 23 0 0 0 18 0M12 11v4" /></>,
  properties: <><path d="M3 21h18M5 21V9h5M10 21V3h9v18M13 7h2m-2 4h2m-2 4h2M7 12v1m0 3v1" /></>,
  layers: <><path d="m12 3 10 5-10 5L2 8Z" /><path d="m2 12 10 5 10-5M2 16l10 5 10-5" /></>,
  chemicals: <><path d="M9 3h6m-5 0v7l-5.7 9.2A1.8 1.8 0 0 0 5.8 22h12.4a1.8 1.8 0 0 0 1.5-2.8L14 10V3M8 15h8" /></>,
  health: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />,
  reports: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 12h8m-8 4h8" /></>,
  complaints: <path d="M21 11.5a8.5 8.5 0 0 1-9 8.5 10 10 0 0 1-4-.8L3 21l1.7-5.1A8 8 0 0 1 3 11.5 8.5 8.5 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5Z" />,
  quality: <><circle cx="12" cy="8" r="6" /><path d="m9 8 2 2 4-4M8 13l-1 9 5-3 5 3-1-9" /></>,
  activity: <path d="M2 12h4l3-8 5 16 3-8h5" />,
  link: <><path d="m10 13 4-4m-6 7-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 1 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 -1)" /></>,
  warning: <><path d="m10.3 3.9-8.1 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.8-3.1l-8.1-14a2 2 0 0 0-3.4 0Z" /><path d="M12 8v5m0 4h.01" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 6.1A8 8 0 0 1 20 12M4 12a8 8 0 0 0 13.9 5.9" /></>,
  search: <><circle cx="10.5" cy="10.5" r="7.5" /><path d="m16 16 5 5" /></>,
  'chevron-left': <path d="m15 5-7 7 7 7" />,
  'chevron-right': <path d="m9 5 7 7-7 7" />,
  'arrow-right': <path d="M4 12h16m-6-6 6 6-6 6" />,
  chart: <><path d="M4 21V14M10 21V8M16 21V3M22 21V11" /></>,
  users: <><circle cx="9" cy="7" r="4" /><path d="M2 21v-3a6 6 0 0 1 12 0v3M17 3a4 4 0 0 1 0 8M17 14a5 5 0 0 1 5 5v2" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6l4 2" /></>,
  trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
} satisfies Record<string, ReactNode>;

export function WorkspaceIcon({ name, className = '' }: { name: keyof typeof paths; className?: string }) {
  return <svg className={`workspace-icon ${className}`.trim()} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}
