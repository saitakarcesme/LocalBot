import {LocalBotOrb} from './orb.js';
import {html} from './lib.js';

export function Figure({state='idle',size,label,color,seed,amplitude=0,tokenCount=0}) {
 const mapped={working:'generating',waiting:'idle',sleeping:'idle'}[state] || state;
 const palette = ['#7fd8b0','#c4df7a','#b9b9bd','#858585'].includes(color) ? 'lagoon' : ['#f2a2c8','#b5a3e5','#8f9cf5','#34343a','#fa2ba1'].includes(color) ? 'dusk' : 'marble';
 return html`<${LocalBotOrb} size=${size} state=${mapped} palette=${palette} label=${label} amplitude=${amplitude} tokenCount=${tokenCount}/>`;
}

export function UserAvatar({name, avatar, size = 36}) {
  if(avatar) return html`<img class="user-avatar" src=${avatar} alt="" style=${`width:${size}px;height:${size}px;object-fit:cover;border-radius:50%`}/>`;
  return html`<span class="user-avatar" style=${`--size:${size}px`} aria-hidden="true">${[...(name || 'Y')][0].toUpperCase()}</span>`;
}

/** Maps a bot's live run to a figure expression. */
export function figureState(run, streaming, approvals) {
  if (!run) return 'idle';
  if (run.status === 'failed') return 'error';
  if (run.status === 'done') return 'success';
  if (['cancelled','interrupted'].includes(run.status)) return 'idle';
  if (run.status === 'waiting' || approvals) return 'waiting';
  if (streaming?.content) return 'working';
  if (run.status === 'queued') return 'sleeping';
  return 'thinking';
}
