import {html, useState, useEffect, useRef, hasNative, native, t, useWindowEvent} from './lib.js';
import {Icon} from './icons.js';

/*
 * The bot's browser, shown as a bare rounded window in the corner. The page itself is a native
 * view placed over `viewport`; the only control is the round minimize button on its corner
 * (drawn natively, because it has to sit above the page). Minimized, a small round button
 * in the window corner brings it back.
 */
export function ComputerDock({bot, state}) {
  const [minimized, setMinimized] = useState(false);
  const viewport = useRef();
  const busy = state.runs.some(r => r.bot === bot.id && ['running', 'waiting', 'queued'].includes(r.status));
  useWindowEvent('localbot:computer-minimize', () => setMinimized(true));
  useEffect(() => {
    if (!hasNative || minimized) return;
    let alive = true, frame;
    const sync = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => {
      if (!alive || !viewport.current) return;
      const rect = viewport.current.getBoundingClientRect();
      const blocked = !!document.querySelector('.scrim, .lightbox, .voice-chat, .menu');
      native('computerDock', {bot: bot.id, hidden: blocked, x: rect.x, y: rect.y, width: rect.width, height: rect.height, radius: 14, viewportWidth: innerWidth, viewportHeight: innerHeight}).catch(() => {});
    }); };
    const observer = new ResizeObserver(sync); observer.observe(viewport.current);
    const mutations = new MutationObserver(sync); mutations.observe(document.body, {childList: true, subtree: true});
    window.addEventListener('resize', sync); sync();
    return () => { alive = false; cancelAnimationFrame(frame); observer.disconnect(); mutations.disconnect(); window.removeEventListener('resize', sync); native('computerDock', {bot: bot.id, hidden: true}).catch(() => {}); };
  }, [bot.id, minimized]);
  if (!hasNative) return null;
  if (minimized) return html`<button type="button" class=${'computer-restore' + (busy ? ' is-busy' : '')} aria-label=${t('Show {name}’s computer', {name: bot.name})} data-tip=${t('Show {name}’s computer', {name: bot.name})} onClick=${() => setMinimized(false)}><${Icon} name="window"/></button>`;
  return html`<section class="computer-dock" aria-label=${t('{name}’s computer', {name: bot.name})} ref=${viewport}/>`;
}
