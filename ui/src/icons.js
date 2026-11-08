import {html} from './lib.js';

// One icon family: 24px grid, 1.75 stroke, round joins. Sized by the parent via --icon.
const paths = {
  search: html`<circle cx="11" cy="11" r="6.25"/><path d="m20 20-4.5-4.5"/>`,
  compose: html`<path d="M12 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/><path d="M17.6 4.4a1.9 1.9 0 0 1 2.7 2.7L13 14.4l-3.5.8.8-3.5 7.3-7.3Z"/>`,
  plus: html`<path d="M12 5v14M5 12h14"/>`,
  arrowUp: html`<path d="M12 19V5M6 11l6-6 6 6"/>`,
  stop: html`<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none"/>`,
  close: html`<path d="M7 7l10 10M17 7 7 17"/>`,
  more: html`<circle cx="6" cy="12" r="1.25" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.25" fill="currentColor" stroke="none"/>`,
  copy: html`<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>`,
  check: html`<path d="m5.5 12.5 4 4 9-9"/>`,
  reply: html`<path d="M10 8 5 12.5l5 4.5"/><path d="M5.5 12.5H14a5 5 0 0 1 5 5V19"/>`,
  retry: html`<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>`,
  file: html`<path d="M13.5 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8.5l-5-5Z"/><path d="M13.5 3.5v5h5"/>`,
  folder: html`<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7.5Z"/>`,
  globe: html`<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5Z"/>`,
  terminal: html`<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="m8 10 2.5 2.5L8 15M13 15h3"/>`,
  cursor: html`<path d="m5 4 5.5 15 2.2-6.3L19 10.5 5 4Z"/>`,
  window: html`<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M3.5 9h17"/>`,
  plug: html`<path d="M9 3.5v4M15 3.5v4M7 7.5h10v3.5a5 5 0 0 1-10 0V7.5ZM12 16v4.5"/>`,
  clock: html`<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>`,
  brain: html`<path d="M9.5 4.5a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 2.5V4.5ZM14.5 4.5a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 2.5V4.5Z"/>`,
  sparkle: html`<path d="M12 4c.6 3.9 2.1 5.4 6 6-3.9.6-5.4 2.1-6 6-.6-3.9-2.1-5.4-6-6 3.9-.6 5.4-2.1 6-6Z"/>`,
  people: html`<circle cx="9" cy="9" r="3.25"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M15.5 6a3.25 3.25 0 0 1 0 6.3M17 14.2a5.5 5.5 0 0 1 3.5 4.8"/>`,
  pin: html`<path d="M14.5 4.5 19.5 9.5l-2.5 1-3 3 .5 4-1.5 1.5-8-8L6.5 9.5l4 .5 3-3 1-2.5Z"/><path d="m8 16-3.5 3.5"/>`,
  archive: html`<rect x="3.5" y="4.5" width="17" height="4.5" rx="1.5"/><path d="M5 9v8.5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4"/>`,
  trash: html`<path d="M4.5 7h15M9.5 7V5.5a1.5 1.5 0 0 1 1.5-1.5h2a1.5 1.5 0 0 1 1.5 1.5V7M6.5 7l.8 11.2a2 2 0 0 0 2 1.8h5.4a2 2 0 0 0 2-1.8L17.5 7"/>`,
  palette: html`<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.4-1.3-1.8-1.3-3 0-1 .8-1.8 1.8-1.8h2.2a3.5 3.5 0 0 0 3.5-3.5c0-3.9-3.6-7-8-7Z"/><circle cx="7.8" cy="11" r="1" fill="currentColor" stroke="none"/><circle cx="10.5" cy="7.5" r="1" fill="currentColor" stroke="none"/><circle cx="14.5" cy="7.8" r="1" fill="currentColor" stroke="none"/>`,
  smile: html`<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14c.9 1.3 2.1 2 3.5 2s2.6-.7 3.5-2M9.5 9.5v1M14.5 9.5v1"/>`,
  download: html`<path d="M12 4.5v11M7 11l5 5 5-5M5 19.5h14"/>`,
  settings: html`<path d="M4.5 7h9M17.5 7h2M4.5 17h2M10.5 17h9"/><circle cx="15.5" cy="7" r="2"/><circle cx="8.5" cy="17" r="2"/>`,
  sliders: html`<path d="M4.5 7h9M17.5 7h2M4.5 17h2M10.5 17h9"/><circle cx="15.5" cy="7" r="2"/><circle cx="8.5" cy="17" r="2"/>`,
  shield: html`<path d="M12 3.5 5 6v5.5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6l-7-2.5Z"/><path d="m9 12 2 2 4-4"/>`,
  chip: html`<rect x="6.5" y="6.5" width="11" height="11" rx="2"/><path d="M9.5 3.5v3M14.5 3.5v3M9.5 17.5v3M14.5 17.5v3M3.5 9.5h3M3.5 14.5h3M17.5 9.5h3M17.5 14.5h3"/>`,
  database: html`<ellipse cx="12" cy="6.5" rx="7" ry="3"/><path d="M5 6.5v11c0 1.7 3.1 3 7 3s7-1.3 7-3v-11M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>`,
  info: html`<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>`,
  user: html`<circle cx="12" cy="8.5" r="3.5"/><path d="M5 19.5a7 7 0 0 1 14 0"/>`,
  chevronDown: html`<path d="m7 10 5 5 5-5"/>`,
  chevronRight: html`<path d="m10 7 5 5-5 5"/>`,
  chevronUp: html`<path d="m7 14 5-5 5 5"/>`,
  sidebar: html`<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M9.5 4.5v15"/>`,
  sun: html`<circle cx="12" cy="12" r="3.5"/><path d="M12 3.5v1.5M12 19v1.5M3.5 12H5M19 12h1.5M6 6l1 1M17 17l1 1M6 18l1-1M17 7l1-1"/>`,
  moon: html`<path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10Z"/>`,
  key: html`<circle cx="8" cy="15" r="3.5"/><path d="m10.5 12.5 8-8M15.5 7.5l2 2M17.5 5.5l2 2"/>`,
  warning: html`<path d="M12 4.5 3.5 19h17L12 4.5Z"/><path d="M12 10v4M12 16.5h.01"/>`,
  edit: html`<path d="M15.6 5.4a1.9 1.9 0 0 1 2.7 2.7L9 17.4l-3.5.8.8-3.5 9.3-9.3Z"/>`,
  bell: html`<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5h-14l1.5-1.5ZM10 20h4"/>`,
  routine: html`<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4M12 8.5V12l2.5 1.5"/>`,
  shuffle: html`<path d="M4.5 7.5h3c4.5 0 5.5 9 10 9h2M4.5 16.5h3c1.5 0 2.6-.9 3.5-2.2M17.5 7.5h2c0 0 0 0 0 0M13.2 9.6c1-1.3 2.3-2.1 4.3-2.1"/><path d="m17.5 5 2.5 2.5-2.5 2.5M17.5 14l2.5 2.5-2.5 2.5"/>`,
  laptop: html`<rect x="5" y="5.5" width="14" height="10" rx="1.8"/><path d="M3 18.5h18"/>`,
  external: html`<path d="M13.5 4.5h6v6M19.5 4.5l-8 8M17.5 13.5v4a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h4"/>`,
  mic: html`<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5"/>`,
  react: html`<circle cx="11" cy="13" r="7.5"/><path d="M8.5 14.5c.7 1 1.5 1.5 2.5 1.5s1.8-.5 2.5-1.5M8.8 11h.01M13.2 11h.01M19 3v5M16.5 5.5h5"/>`,
  thumbUp: html`<path d="M7.5 10.5v9M7.5 10.5l3.8-6.5a2 2 0 0 1 2.7 2.2l-.7 3.3h4.9a2 2 0 0 1 2 2.4l-1.2 6a2 2 0 0 1-2 1.6H7.5M4 10.5h3.5v9H4z"/>`,
  thumbDown: html`<path d="M7.5 13.5v-9M7.5 13.5l3.8 6.5a2 2 0 0 0 2.7-2.2l-.7-3.3h4.9a2 2 0 0 0 2-2.4l-1.2-6a2 2 0 0 0-2-1.6H7.5M4 13.5h3.5v-9H4z"/>`,
  thread: html`<path d="M5.5 5h13a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H11l-4.5 3.5V17h-1a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/><path d="M8 9.5h8M8 12.5h5"/>`,
  image: html`<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m4 17 5-5 4 4 2.5-2.5L20 17.5"/>`,
  at: html`<circle cx="12" cy="12" r="3.5"/><path d="M15.5 8.5v5a2.5 2.5 0 0 0 5 0V12a8.5 8.5 0 1 0-3.5 6.9"/>`,
  skill: html`<path d="M13 3 5.5 13.5H11l-1 7.5 8-11h-5.5L13 3Z"/>`,
  tasks: html`<path d="M10.5 6.5h9M10.5 12h9M10.5 17.5h9M4.5 6.5l1.2 1.2 2.3-2.4M4.5 12l1.2 1.2L8 10.8M4.5 17.5l1.2 1.2L8 16.3"/>`,
  star: html`<path d="m12 3.8 2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8L12 3.8Z"/>`,
  eye: html`<path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/>`,
  eyeOff: html`<path d="M4 4l16 16M9.9 5.8A9.7 9.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a15 15 0 0 1-3 3.7M14.1 14.2a3 3 0 0 1-4.3-4.3M6.3 7.6A15 15 0 0 0 2.5 12s3.5 6.5 9.5 6.5c1.3 0 2.5-.3 3.6-.8"/>`,
  bellOff: html`<path d="M4 4l16 16M9.5 19.5a2.7 2.7 0 0 0 5 0M17.8 13.5V11a5.8 5.8 0 0 0-8.3-5.2M6.7 8.3A5.8 5.8 0 0 0 6.2 11v2.5L4.5 16.5h11"/>`,
  link: html`<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>`,
  play: html`<path d="M8 5.5v13l10.5-6.5L8 5.5Z" fill="currentColor"/>`,
  pause: html`<rect x="6.5" y="5.5" width="3.8" height="13" rx="1" fill="currentColor" stroke="none"/><rect x="13.7" y="5.5" width="3.8" height="13" rx="1" fill="currentColor" stroke="none"/>`,
  expand: html`<path d="M14 4.5h5.5V10M10 19.5H4.5V14M19.5 4.5 13.5 10.5M4.5 19.5l6-6"/>`,
  undo: html`<path d="M8 7 4 11l4 4"/><path d="M4.5 11H14a5.5 5.5 0 0 1 0 11h-3"/>`,
  keyboard: html`<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7 14h10"/>`,
  grip: html`<circle cx="9" cy="7" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="7" r="1.2" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="9" cy="17" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="17" r="1.2" fill="currentColor" stroke="none"/>`,
  chevronLeft: html`<path d="m14.5 6-6 6 6 6"/>`,
  volume: html`<path d="M4.5 9.5v5h3.5l4.5 4v-13L8 9.5H4.5ZM16 9a4.5 4.5 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>`,
  wave: html`<path d="M4 10v4M8 6.5v11M12 4v16M16 8v8M20 10.5v3"/>`,
  filter: html`<path d="M4 6h16M7 12h10M10 18h4"/>`,
  calendar: html`<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>`,
  tag: html`<path d="M3.5 12.2V5.5a2 2 0 0 1 2-2h6.7a2 2 0 0 1 1.4.6l6.3 6.3a2 2 0 0 1 0 2.8l-6.7 6.7a2 2 0 0 1-2.8 0L4.1 13.6a2 2 0 0 1-.6-1.4Z"/><circle cx="8.3" cy="8.3" r="1.3"/>`,
  section: html`<path d="M4 6.5h16M4 12h10M4 17.5h16"/>`,
  hook: html`<circle cx="7" cy="17" r="2.5"/><circle cx="17" cy="17" r="2.5"/><circle cx="12" cy="6.5" r="2.5"/><path d="M12 9v3.5l-3.5 3M12 12.5l3.5 3"/>`,
  lock: html`<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>`,
  mail: html`<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="m4 7.5 8 6 8-6"/>`,
  text: html`<path d="M5 6.5h14M5 11h14M5 15.5h9"/>`,
  chart: html`<path d="M4.5 19.5v-15M4.5 19.5h15M8.5 16v-5M12.5 16V8M16.5 16v-3"/>`,
  upload: html`<path d="M12 15.5V4.5M7.5 9 12 4.5 16.5 9M4.5 15v2.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V15"/>`,
  help: html`<circle cx="12" cy="12" r="8.5"/><path d="M9.7 9.5a2.4 2.4 0 1 1 3.5 2.1c-.8.4-1.2 1-1.2 1.9M12 16.5h.01"/>`,
  group: html`<circle cx="8.5" cy="9" r="3"/><circle cx="16.5" cy="10" r="2.5"/><path d="M3 18.5a5.5 5.5 0 0 1 11 0M15 18.5a4 4 0 0 1 6 0"/>`,
  zoomIn: html`<circle cx="11" cy="11" r="6.25"/><path d="m20 20-4.5-4.5M8.5 11h5M11 8.5v5"/>`,
  chevronsLeft: html`<path d="m12 6-6 6 6 6M18 6l-6 6 6 6"/>`,
  dot: html`<circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none"/>`,
  pencilLine: html`<path d="M4 20h16M6 16l1-4 8.5-8.5a1.9 1.9 0 0 1 2.7 2.7L9.7 14.7 6 16Z"/>`,
  eraser: html`<path d="m7 20-3.5-3.5a2 2 0 0 1 0-2.8l9.7-9.7a2 2 0 0 1 2.8 0l4 4a2 2 0 0 1 0 2.8L12 19M7 20h13M8.5 9l6.5 6.5"/>`,
};

export function Icon({name, size}) {
  return html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" style=${size ? `--icon:${size}px` : undefined}>${paths[name] || paths.file}</svg>`;
}

/** Picks an icon for a tool step. */
export function toolIcon(name = '') {
  if (name === 'thinking') return 'sparkle';
  if (name.startsWith('browser') || name === 'web_search') return 'globe';
  if (name.startsWith('computer')) return 'cursor';
  if (name === 'run_command') return 'terminal';
  if (name === 'mac_command') return 'laptop';
  if (name.includes('file')) return 'file';
  if (name.includes('routine')) return 'routine';
  if (name.startsWith('connection')) return 'plug';
  if (name === 'remember' || name === 'update_personality') return 'brain';
  if (name === 'use_skill') return 'skill';
  if (name === 'request_secret') return 'lock';
  if (name.includes('bot') || name === 'check_task') return 'people';
  return 'sparkle';
}
