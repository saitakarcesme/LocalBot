import {api, connectStream, useState, useEffect, useRef, toast, hasNative, native, setMediaKey} from './lib.js';
import {playSound} from './sounds.js';

/*
 * Data layer. The runtime pushes "changed" events; we refetch the snapshot and
 * the open conversation. Streamed tokens bypass React state entirely and go to
 * a tiny store that only the live bubble subscribes to, so typing never
 * re-renders the whole app.
 */
const streamListeners = new Set();
export const liveStream = {run: null, bot: null, content: '', reasoning: '', started: 0, thread: null, author: null};
function emitStream() { streamListeners.forEach(fn => fn()); }
export function useLiveStream() {
  const [, force] = useState(0);
  useEffect(() => { const fn = () => force(n => n + 1); streamListeners.add(fn); return () => streamListeners.delete(fn); }, []);
  return liveStream;
}
function syncStream(snapshotStreaming) {
  if (!snapshotStreaming) { if (liveStream.run) { liveStream.run = null; liveStream.content = ''; liveStream.reasoning = ''; emitStream(); } return; }
  if (snapshotStreaming.run !== liveStream.run || snapshotStreaming.content.length > liveStream.content.length || snapshotStreaming.started !== liveStream.started) {
    Object.assign(liveStream, {thread: null, author: null}, snapshotStreaming); emitStream();
  }
}

/** `limit` grows when the user asks for older messages. */
export function useAppData(selected, limit = 200) {
  const [state, setState] = useState(null);
  const [bot, setBot] = useState(null);
  const [connected, setConnected] = useState(true);
  const [authError, setAuthError] = useState(false);
  const selectedRef = useRef(selected), limitRef = useRef(limit);
  selectedRef.current = selected; limitRef.current = limit;
  const busy = useRef(false), dirty = useRef(false);

  async function refresh() {
    if (busy.current) { dirty.current = true; return; }
    busy.current = true;
    try {
      do {
        dirty.current = false;
        const id = selectedRef.current;
        const [snapshot, data] = await Promise.all([api('state'), id ? api('bot?id=' + encodeURIComponent(id) + '&limit=' + limitRef.current).catch(() => null) : null]);
        setMediaKey(snapshot.mediaKey);
        syncStream(snapshot.streaming);
        setState(snapshot);
        setBot(data && id === selectedRef.current ? {id, ...data} : null);
      } while (dirty.current);
    } catch (e) { if (e.message === 'Unauthorized') setAuthError(true); else toast(e.message, 'error'); }
    finally { busy.current = false; }
  }

  useEffect(() => { refresh(); }, [selected, limit]);
  // A dropped stream reconnects within a few hundred ms; only a lasting outage is shown.
  const offlineTimer = useRef();
  useEffect(() => connectStream(event => {
    if (event.type === 'hello') { clearTimeout(offlineTimer.current); offlineTimer.current = null; setConnected(true); refresh(); }
    else if (event.type === 'changed') refresh();
    else if (event.type === 'disconnected') { if (!offlineTimer.current) offlineTimer.current = setTimeout(() => setConnected(false), 2500); }
    else if (event.type === 'delta') {
      if (liveStream.run !== event.run || (liveStream.author || null) !== (event.author || null)) Object.assign(liveStream, {run: event.run, bot: event.bot, thread: event.thread || null, author: event.author || null, content: '', reasoning: '', started: Date.now()});
      if (event.content) liveStream.content += event.content;
      if (event.reasoning) liveStream.reasoning += event.reasoning;
      emitStream();
    } else if (event.type === 'notify') notify(event);
  }), []);

  return {state, bot, connected, refresh, authError};
}

let latestPrefs = null;
export function setNotificationPrefs(prefs) { latestPrefs = prefs; }
function notify(event) {
  if (!latestPrefs?.notifications) return;
  window.dispatchEvent(new CustomEvent('localbot:notified', {detail: event}));
  const quiet = document.hasFocus() && document.visibilityState === 'visible';
  if (latestPrefs.sound && (!quiet || event.kind === 'approval')) playSound(latestPrefs.soundName);
  if (hasNative) { if (!quiet) native('notify', {title: event.title, body: event.body, sound: false, bot: event.bot}).catch(() => {}); return; }
  if (quiet || !('Notification' in window) || Notification.permission !== 'granted') return;
  new Notification(event.title, {body: event.body, silent: true});
}

export const activeRunFor = (state, botId, thread = null) => state?.runs.find(r => r.bot === botId && (r.thread || null) === thread && ['running', 'waiting'].includes(r.status))
  || state?.runs.findLast(r => r.bot === botId && (r.thread || null) === thread && r.status === 'queued');
/** Any work in progress for the bot, in the main chat or a thread. */
export const busyRunFor = (state, botId) => state?.runs.find(r => r.bot === botId && ['queued', 'running', 'waiting'].includes(r.status));
