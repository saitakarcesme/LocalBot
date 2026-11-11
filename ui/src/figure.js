import {html} from './lib.js';
export {LocalBotFigure as Figure} from './identity.js';

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
  if (streaming?.content) return 'typing';
  if (run.activity) return run.activity;
  if (run.status === 'queued') return 'sleeping';
  return 'thinking';
}
