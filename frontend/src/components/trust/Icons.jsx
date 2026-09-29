// Small inline icons so the UI never depends on emoji.
const base = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };

export const Lock = (p) => (
  <svg {...base} {...p}><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
);
export const Arrow = (p) => (
  <svg {...base} {...p}><path d="M4 12h16M14 6l6 6-6 6" /></svg>
);
export const Check = (p) => (
  <svg {...base} strokeWidth={2.6} {...p}><path d="M5 12l4 4L19 7" /></svg>
);
export const Block = (p) => (
  <svg {...base} strokeWidth={2.4} {...p}><circle cx="12" cy="12" r="9" /><path d="M6 6l12 12" /></svg>
);
export const Shield = (p) => (
  <svg {...base} {...p}><path d="M12 3l8 3v6c0 4.5-3.4 7.8-8 9-4.6-1.2-8-4.5-8-9V6l8-3z" /></svg>
);
export const ShieldCheck = (p) => (
  <svg {...base} {...p}><path d="M12 3l8 3v6c0 4.5-3.4 7.8-8 9-4.6-1.2-8-4.5-8-9V6l8-3z" /><path d="M8.5 12l2.3 2.3L15.5 9.6" /></svg>
);
export const Device = (p) => (
  <svg {...base} {...p}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></svg>
);
export const Doc = (p) => (
  <svg {...base} {...p}><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></svg>
);
export const Folder = (p) => (
  <svg {...base} {...p}><path d="M3 6h6l2 2h10v11H3z" /></svg>
);
export const User = (p) => (
  <svg {...base} {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
);
export const Gear = (p) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
);
export const Power = (p) => (
  <svg {...base} {...p}><path d="M12 3v9" /><path d="M6.3 6.3a8 8 0 1 0 11.4 0" /></svg>
);
export const Spinner = (p) => (
  <svg {...base} className="spin" {...p}><path d="M12 3a9 9 0 1 0 9 9" /></svg>
);
