import {h, render, Fragment, createContext, Component} from '../vendor/preact.mjs';
import {useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect, useContext} from '../vendor/hooks.mjs';
import htm from '../vendor/htm.mjs';
import {t, locale} from './i18n.js';
export {t, plural, locale, language} from './i18n.js';

export const html = htm.bind(h);
export {h, render, Fragment, createContext, Component, useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect, useContext};

// The Mac app injects the token; self-hosted links carry it in the URL hash.
// It is kept for this tab only so a reload keeps working, and never put in the URL.
let token = window.__localToken || location.hash.slice(1);
try { if (token) sessionStorage.setItem('localbot-token', token); else token = sessionStorage.getItem('localbot-token') || ''; } catch {}
delete window.__localToken;
history.replaceState(null, '', '/');
export const hasToken = !!token;

export async function api(path, body) {
  const response = await fetch('/api/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(data.error || 'Request failed');
  return data;
}

/** Opens the runtime event stream; reconnects with backoff. */
export function connectStream(onEvent) {
  let stopped = false, delay = 300;
  (async function loop() {
    while (!stopped) {
      try {
        const res = await fetch('/api/stream', {headers: {Authorization: 'Bearer ' + token}});
        if (!res.ok) throw Error('stream ' + res.status);
        delay = 300;
        const reader = res.body.getReader(), decoder = new TextDecoder();
        let buffer = '';
        while (!stopped) {
          const {value, done} = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, {stream: true});
          let i;
          while ((i = buffer.indexOf('\n\n')) >= 0) {
            const chunk = buffer.slice(0, i); buffer = buffer.slice(i + 2);
            for (const line of chunk.split('\n')) if (line.startsWith('data: ')) { try { onEvent(JSON.parse(line.slice(6))); } catch (e) { console.error(e); } }
          }
        }
      } catch {}
      if (!stopped) { onEvent({type: 'disconnected'}); await new Promise(r => setTimeout(r, delay)); delay = Math.min(delay * 2, 4000); }
    }
  })();
  return () => { stopped = true; };
}

export async function downloadFile(id) {
  const res = await fetch('/api/file/raw?id=' + encodeURIComponent(id), {headers: {Authorization: 'Bearer ' + token}});
  if (!res.ok) throw Error('Could not open file');
  const name = decodeURIComponent((res.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/)?.[1] || 'file');
  saveBlob(await res.blob(), name);
}

export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---- Native Mac bridge. Every caller must have a browser fallback or hide the feature. ----
export const hasNative = !!window.webkit?.messageHandlers?.localbot;
const nativeWait = new Map();
let nativeCounter = 0;
export function native(action, args = {}) {
  if (!hasNative) return Promise.reject(Error(t('This needs the LocalBot Mac app.')));
  return new Promise((resolve, reject) => {
    const id = String(++nativeCounter);
    const timer = setTimeout(() => { nativeWait.delete(id); reject(Error('The Mac app did not respond')); }, 120000);
    nativeWait.set(id, {resolve, reject, timer});
    window.webkit.messageHandlers.localbot.postMessage({id, action, ...args});
  });
}
window.nativeResult = (id, result, error) => {
  const pending = nativeWait.get(id);
  if (!pending) return;
  clearTimeout(pending.timer); nativeWait.delete(id);
  error ? pending.reject(Error(error)) : pending.resolve(result);
};

export async function copyText(text) {
  if (hasNative) return native('copy', {text});
  return navigator.clipboard.writeText(text);
}

// ---- Toasts ----
const toastListeners = new Set();
let toastSeq = 0;
export function toast(message, kind = 'info', action = null) {
  const item = {id: ++toastSeq, message: humanError(String(message?.message || message)), kind, action};
  toastListeners.forEach(fn => fn(item));
  return item.id;
}
export function useToasts() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const add = item => {
      const life = item.action ? 7000 : 4200;
      setItems(list => [...list.slice(-2), item]);
      setTimeout(() => setItems(list => list.map(x => x.id === item.id ? {...x, leaving: true} : x)), life);
      setTimeout(() => setItems(list => list.filter(x => x.id !== item.id)), life + 200);
    };
    const dismiss = e => setItems(list => list.filter(x => x.id !== e.detail));
    toastListeners.add(add); window.addEventListener('localbot:toast-dismiss', dismiss);
    return () => { toastListeners.delete(add); window.removeEventListener('localbot:toast-dismiss', dismiss); };
  }, []);
  return items;
}
export const dismissToast = id => window.dispatchEvent(new CustomEvent('localbot:toast-dismiss', {detail: id}));

// Runtime and model-server errors arrive as short technical English. Known ones are
// rewritten in plain, translated language; the original stays available for copying.
const ERRORS = [
  [/^Failed to fetch$|NetworkError|Load failed/i, 'LocalBot is not responding. It may be restarting.'],
  [/fetch failed|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH/i, 'The model server is not reachable. Check that it is running.'],
  [/needs its API key/i, 'This model server needs its API key.'],
  [/Model request failed \(HTTP 5\d\d\)/i, 'The model server had a problem. This is usually temporary; try again.'],
  [/Model request failed \(HTTP 404\)/i, 'The model server does not know this model. Pick another one in Settings.'],
  [/Model request failed \(HTTP 4\d\d\)/i, 'The model server refused the request. Check the model name and key in Settings.'],
  [/operation was aborted due to timeout|TimeoutError|timed out/i, 'The model took too long to answer. Try again.'],
  [/Step limit reached/i, 'This task used all its steps. Send a message to continue.'],
  [/Wait for the current reply to finish/i, 'Wait for the current reply to finish.'],
  [/Wait for current tasks before changing the model/i, 'Wait for running tasks to finish before changing the model.'],
  [/Queue is full/i, 'Too many messages are waiting. Let some finish first.'],
  [/Cloud endpoints are disabled/i, 'Models must run on this computer or your private network.'],
  [/LocalBot restarted/i, 'LocalBot restarted while this was running. Send a message to continue.'],
  [/incomplete tool call/i, 'The model sent a broken action. Try again, or use a model that supports tools.'],
  [/Approval expired/i, 'This request is no longer waiting.'],
  [/Request failed|Request too large/i, 'That did not work. Try again.'],
];
export function humanError(message) {
  const text = String(message || '');
  for (const [pattern, plain] of ERRORS) if (pattern.test(text)) return t(plain);
  return t(text);
}

/** Runs an async action and reports failures as a toast. */
export async function attempt(fn) {
  try { return await fn(); } catch (e) { toast(e.message, 'error'); return undefined; }
}

export const cx = (...parts) => parts.filter(Boolean).join(' ');
export const isMac = /Mac/.test(navigator.platform);
export const modKey = isMac ? '⌘' : 'Ctrl';

export function relativeTime(ms) {
  if (!ms) return '';
  const d = new Date(ms), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(locale(), {hour: 'numeric', minute: '2-digit'});
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return t('Yesterday');
  if (now - d < 6 * 864e5) return d.toLocaleDateString(locale(), {weekday: 'short'});
  return d.toLocaleDateString(locale(), {month: 'short', day: 'numeric'});
}

export function separatorTime(ms) {
  const d = new Date(ms), now = new Date();
  const time = d.toLocaleTimeString(locale(), {hour: 'numeric', minute: '2-digit'});
  if (d.toDateString() === now.toDateString()) return t('Today') + ' ' + time;
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return t('Yesterday') + ' ' + time;
  return d.toLocaleDateString(locale(), {weekday: 'long', month: 'short', day: 'numeric'}) + ' ' + time;
}

export const displayName = name => String(name || '').replace(/^[0-9a-f-]{36}-/, '');

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Focus trap + Escape + focus restore for dialogs and menus. */
export function useFocusTrap(ref, onClose, {restore = true, initial} = {}) {
  useEffect(() => {
    const previous = document.activeElement;
    const node = ref.current;
    const focusable = () => [...node.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(el => el.getClientRects().length);
    requestAnimationFrame(() => {
      const target = (initial && node.querySelector(initial)) || focusable()[0];
      target?.focus();
      if (target?.select && target.value) target.select();
    });
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose?.(); return; }
      if (e.key !== 'Tab') return;
      const items = focusable(); if (!items.length) return;
      const first = items[0], last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    node.addEventListener('keydown', onKey);
    // Escape also closes when focus has left the dialog (after a field saved itself, for example).
    const outside = e => { if (e.key === 'Escape' && !node.contains(document.activeElement) && !document.querySelector('.menu, .popover')) { e.preventDefault(); onClose?.(); } };
    window.addEventListener('keydown', outside);
    return () => { node.removeEventListener('keydown', onKey); window.removeEventListener('keydown', outside); if (restore && previous?.isConnected) previous.focus({preventScroll: true}); };
  }, []);
}

export const dateTime = ms => new Date(ms).toLocaleString(locale(), {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'});
export const clockTime = ms => new Date(ms).toLocaleTimeString(locale(), {hour: 'numeric', minute: '2-digit'});

// ---- Bot files ----
let mediaKey = '';
export function setMediaKey(key) { mediaKey = key; }
/** A URL the page can put in <img>, <video> or a sandboxed frame. */
export const mediaUrl = id => `/media/${mediaKey}/${encodeURIComponent(id)}`;
const KINDS = [
  ['image', /\.(png|jpe?g|gif|webp)$/i], ['video', /\.(mp4|webm|mov)$/i], ['audio', /\.(mp3|wav|m4a|ogg)$/i], ['pdf', /\.pdf$/i], ['page', /\.html?$/i], ['svg', /\.svg$/i],
  ['table', /\.(csv|tsv)$/i], ['markdown', /\.(md|markdown)$/i], ['data', /\.(json|ya?ml|toml|xml)$/i],
  ['code', /\.(js|mjs|ts|tsx|jsx|py|rb|go|rs|c|h|cpp|java|kt|swift|sh|zsh|css|scss|sql|php|lua|r)$/i], ['text', /\.(txt|log|ini|env|conf)$/i],
  ['archive', /\.(zip|tar|gz|7z|rar)$/i], ['doc', /\.(docx?|pages|rtf|odt)$/i], ['sheet', /\.(xlsx?|numbers|ods)$/i],
];
export function fileKind(name) { for (const [kind, pattern] of KINDS) if (pattern.test(name || '')) return kind; return 'file'; }
export const extensionOf = name => { const m = /\.([a-z0-9]{1,5})$/i.exec(name || ''); return m ? m[1].toLowerCase() : ''; };

export function blobToBase64(blob) { return fileToBase64(blob); }

/** Shrinks a picture to a small square data: URL for avatars. */
export function squareImage(file, size = 160) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height), canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      canvas.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url); resolve(canvas.toDataURL('image/jpeg', .86));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(Error(t('This image could not be read.'))); };
    img.src = url;
  });
}

/** Subscribes a component to a window event. */
export function useWindowEvent(name, handler, deps = []) {
  useEffect(() => { window.addEventListener(name, handler); return () => window.removeEventListener(name, handler); }, deps);
}
export const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, {detail}));
export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
