import {html, useState, useEffect, useRef, useLayoutEffect, cx, useFocusTrap, Component, t, useToasts, dismissToast, copyText, toast} from './lib.js';
import {Icon} from './icons.js';

export function IconButton({icon, label, onClick, size = 'md', active, disabled, tip = true, className, ...rest}) {
  return html`<button type="button" class=${cx('icon-button', 'size-' + size, active && 'is-active', className)} aria-label=${label} data-tip=${tip ? label : undefined}
    disabled=${disabled} onClick=${onClick} ...${rest}><${Icon} name=${icon}/></button>`;
}

export function Button({children, kind = 'secondary', onClick, disabled, type = 'button', className, ...rest}) {
  return html`<button type=${type} class=${cx('button', 'button-' + kind, className)} disabled=${disabled} onClick=${onClick} ...${rest}>${children}</button>`;
}

// Keep the native file dialog while giving every file field the same geometry.
export function FilePicker({accept,onChange}) {
  const [name,setName]=useState('');
  return html`<span class="file-picker"><span class="file-picker-button">${t('Choose file')}</span><span class="file-picker-name">${name||t('No file selected')}</span><input type="file" accept=${accept} onChange=${e=>{setName(e.target.files[0]?.name||'');onChange?.(e);}}/></span>`;
}

export function Switch({checked, onChange, label, disabled}) {
  return html`<button type="button" role="switch" aria-checked=${String(!!checked)} aria-label=${label} class="switch" disabled=${disabled}
    onClick=${() => onChange(!checked)}><span class="switch-knob"/></button>`;
}

export function Segmented({value, options, onChange, label}) {
  return html`<div class="segmented" role="radiogroup" aria-label=${label}>
    ${options.map(([v, text]) => html`<button type="button" role="radio" aria-checked=${String(v === value)} class=${cx('segment', v === value && 'is-selected')} onClick=${() => onChange(v)}>${text}</button>`)}
  </div>`;
}

export function Select({value, options, onChange, label}) {
  return html`<span class="select"><select aria-label=${label} value=${value} onChange=${e => onChange(e.target.value)}>
    ${options.map(([v, text]) => html`<option value=${v}>${text}</option>`)}
  </select><${Icon} name="chevronDown"/></span>`;
}

// ---- Menus (context menus and "more" menus) ----
// One menu at a time. Each open gets a fixed key so app re-renders never remount it;
// pressing the same anchor again closes it (toggle).
let menuListener = null, currentMenu = null, menuSeq = 0;
export function openMenu(menu) {
  if (menu.anchor && currentMenu?.anchor === menu.anchor) { closeMenu(); return; }
  currentMenu = {...menu, key: ++menuSeq};
  menu.anchor?.setAttribute('aria-expanded', 'true');
  menuListener?.(currentMenu);
}
export function closeMenu() {
  currentMenu?.anchor?.removeAttribute('aria-expanded');
  currentMenu = null;
  menuListener?.(null);
}

export function MenuHost() {
  const [menu, setMenu] = useState(null);
  useEffect(() => { menuListener = setMenu; return () => { menuListener = null; }; }, []);
  return menu ? html`<${Menu} key=${menu.key} ...${menu} onClose=${closeMenu}/>` : null;
}

function Menu({x, y, anchor, items, onClose, align = 'start'}) {
  const ref = useRef();
  const [pos, setPos] = useState({left: -9999, top: -9999});
  const [active, setActive] = useState(-1);
  const actionable = items.map((it, i) => it.separator || it.header || it.disabled ? -1 : i).filter(i => i >= 0);
  useLayoutEffect(() => {
    // Layout size, not the visual box: the entrance animation scales the menu.
    const box = {width: ref.current.offsetWidth, height: ref.current.offsetHeight}, vw = innerWidth, vh = innerHeight, gap = 4;
    let left, top;
    if (anchor) {
      const r = anchor.getBoundingClientRect();
      left = align === 'end' ? r.right - box.width : r.left;
      top = r.bottom + gap;
      if (top + box.height > vh - 8) top = r.top - box.height - gap;
    } else { left = x; top = y; if (top + box.height > vh - 8) top = y - box.height; }
    setPos({left: Math.max(8, Math.min(left, vw - box.width - 8)), top: Math.max(8, Math.min(top, vh - box.height - 8))});
    ref.current.focus();
  }, []);
  useEffect(() => {
    // Presses on the anchor are left to its click handler, which toggles the menu closed.
    const away = e => { if (!ref.current?.contains(e.target) && !anchor?.contains(e.target)) onClose(); };
    const blur = () => onClose();
    window.addEventListener('pointerdown', away, true); window.addEventListener('blur', blur); window.addEventListener('resize', blur);
    return () => { window.removeEventListener('pointerdown', away, true); window.removeEventListener('blur', blur); window.removeEventListener('resize', blur); };
  }, []);
  const choose = item => { onClose(); if (anchor?.isConnected) anchor.focus({preventScroll: true}); item.onSelect?.(); };
  const onKey = e => {
    const at = actionable.indexOf(active);
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(actionable[(at + 1) % actionable.length]); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(actionable[(at - 1 + actionable.length) % actionable.length]); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (items[active]) choose(items[active]); }
    else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); onClose(); anchor?.focus?.({preventScroll: true}); }
  };
  return html`<div ref=${ref} class="menu" role="menu" tabindex="-1" style=${`left:${pos.left}px;top:${pos.top}px`} onKeyDown=${onKey} onContextMenu=${e => e.preventDefault()}>
    ${items.map((item, i) => item.separator ? html`<div class="menu-separator" role="separator"/>` : item.header ? html`<div class="menu-header">${item.header}</div>` : html`
      <button type="button" role="menuitem" class=${cx('menu-row', i === active && 'is-active', item.danger && 'is-danger')} disabled=${item.disabled}
        onPointerEnter=${() => setActive(i)} onPointerLeave=${() => setActive(-1)} onClick=${() => choose(item)}>
        ${item.icon ? html`<${Icon} name=${item.icon}/>` : null}<span class="menu-label">${item.label}</span>
        ${item.checked ? html`<span class="menu-check"><${Icon} name="check"/></span>` : item.hint ? html`<kbd aria-hidden="true">${item.hint}</kbd>` : null}
      </button>`)}
  </div>`;
}

// ---- Dialogs ----
export function Dialog({title, onClose, children, footer, className, wide, initial, labelledBy}) {
  const ref = useRef();
  useFocusTrap(ref, onClose, {initial});
  return html`<div class="scrim" onPointerDown=${e => { if (e.target === e.currentTarget) onClose?.(); }}>
    <section ref=${ref} class=${cx('dialog', wide && 'dialog-wide', className)} role="dialog" aria-modal="true" aria-label=${labelledBy ? undefined : title} aria-labelledby=${labelledBy}>
      ${title !== undefined ? html`<header class="dialog-header"><h2>${title}</h2>${onClose ? html`<${IconButton} icon="close" label=${t('Close')} size="sm" tip=${false} onClick=${onClose}/>` : null}</header>` : null}
      <div class="dialog-body">${children}</div>
      ${footer ? html`<footer class="dialog-footer">${footer}</footer>` : null}
    </section>
  </div>`;
}

export function Spinner({size = 14}) {
  return html`<span class="spinner" style=${`--size:${size}px`} aria-hidden="true"/>`;
}

// ---- Toasts (optionally with one action, e.g. Undo) ----
export function Toasts() {
  const items = useToasts();
  return html`<div class="toasts" role="status" aria-live="polite">${items.map(item => html`<div key=${item.id} class=${cx('toast', 'is-' + item.kind, item.leaving && 'is-leaving', item.action && 'has-action')}>
    ${item.kind === 'error' ? html`<${Icon} name="warning"/>` : null}<span>${item.message}</span>
    ${item.action ? html`<button type="button" class="toast-action" onClick=${() => { dismissToast(item.id); item.action.run(); }}>${item.action.label}</button>` : null}</div>`)}</div>`;
}
/** Shows "Done · Undo" and runs `undo` if the user asks. */
export const undoToast = (message, undo) => toast(message, 'info', {label: t('Undo'), run: undo});

// ---- Confirm ----
let confirmListener = null;
/** Resolves true when the user confirms. `danger` paints the confirm button red. */
export function confirm({title, message, confirmLabel, danger = false}) {
  return new Promise(resolve => confirmListener?.({title, message, confirmLabel, danger, resolve}));
}
/** Asks for one short line of text. Resolves the trimmed text, or null when cancelled. */
export function promptText({title, label, value = '', confirmLabel}) {
  return new Promise(resolve => confirmListener?.({title, input: {label, value}, confirmLabel, resolve}));
}
export function ConfirmHost() {
  const [ask, setAsk] = useState(null);
  const [text, setText] = useState('');
  useEffect(() => { confirmListener = next => { setText(next?.input?.value || ''); setAsk(next); }; return () => { confirmListener = null; }; }, []);
  if (!ask) return null;
  const done = value => { setAsk(null); ask.resolve(value); };
  if (ask.input) {
    const submit = () => text.trim() && done(text.trim());
    return html`<${Dialog} title=${ask.title} onClose=${() => done(null)} className="confirm-dialog" initial="input"
      footer=${html`<${Button} onClick=${() => done(null)}>${t('Cancel')}</${Button}><${Button} kind="primary" disabled=${!text.trim()} onClick=${submit}>${ask.confirmLabel || t('Save')}</${Button}>`}>
      <label class="field"><span>${ask.input.label}</span><input value=${text} maxlength="60" onInput=${e => setText(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}/></label>
    </${Dialog}>`;
  }
  return html`<${Dialog} title=${ask.title} onClose=${() => done(false)} className="confirm-dialog" initial=".confirm-yes"
    footer=${html`<${Button} onClick=${() => done(false)}>${t('Cancel')}</${Button}><${Button} kind=${ask.danger ? 'danger' : 'primary'} className="confirm-yes" onClick=${() => done(true)}>${ask.confirmLabel || t('OK')}</${Button}>`}>
    <p class="dialog-lead">${ask.message}</p>
  </${Dialog}>`;
}

// ---- Error boundary: a broken panel never blanks the whole window ----
export class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = {error: null}; }
  componentDidCatch(error) { console.error(error); this.setState({error}); }
  componentDidUpdate(prev) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({error: null}); }
  render() {
    if (!this.state.error) return this.props.children;
    const detail = String(this.state.error?.stack || this.state.error);
    return html`<div class=${cx('crash', this.props.compact && 'is-compact')} role="alert">
      <${Icon} name="warning"/>
      <strong>${t('Something went wrong in this part of the app.')}</strong>
      <span>${t('Your conversations are safe.')}</span>
      <div class="crash-actions">
        <${Button} kind="primary" onClick=${() => this.setState({error: null})}>${t('Try again')}</${Button}>
        <${Button} onClick=${() => copyText(detail).then(() => toast(t('Error details copied'))).catch(() => {})}>${t('Copy error details')}</${Button}>
      </div>
    </div>`;
  }
}

/** Grey bars shown while a conversation or panel loads. */
export function Skeleton({rows = 3, kind = 'chat'}) {
  return html`<div class=${'skeleton skeleton-' + kind} aria-busy="true" aria-label=${t('Loading')}>
    ${Array.from({length: rows}, (_, i) => html`<div class=${cx('skeleton-row', kind === 'chat' && i % 2 === 1 && 'is-right')} style=${`--w:${[62, 38, 74, 46, 55][i % 5]}%`}/>`)}
  </div>`;
}

/** A floating panel anchored to an element (emoji picker, mention list). Closes on outside press or Escape. */
export function Popover({anchor, onClose, children, className, placement = 'top-start', width}) {
  const ref = useRef();
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    const place = () => {
      const a = anchor.getBoundingClientRect(), box = ref.current.getBoundingClientRect(), gap = 8;
      let left = placement.endsWith('end') ? a.right - box.width : a.left;
      let top = placement.startsWith('top') ? a.top - box.height - gap : a.bottom + gap;
      if (top < 8) top = a.bottom + gap;
      if (top + box.height > innerHeight - 8) top = Math.max(8, a.top - box.height - gap);
      setPos({left: Math.max(8, Math.min(left, innerWidth - box.width - 8)), top});
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, []);
  useEffect(() => {
    const away = e => { if (!ref.current?.contains(e.target) && !anchor.contains(e.target)) onClose(); };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('pointerdown', away, true); window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('pointerdown', away, true); window.removeEventListener('keydown', key, true); };
  }, []);
  return html`<div ref=${ref} class=${cx('popover', className)} style=${`left:${pos?.left ?? -9999}px;top:${pos?.top ?? -9999}px;${width ? `width:${width}px;` : ''}`}>${children}</div>`;
}

export function Tabs({value, options, onChange, label}) {
  return html`<div class="tabs" role="tablist" aria-label=${label}>
    ${options.map(([v, text, count]) => html`<button type="button" role="tab" aria-selected=${String(v === value)} class=${cx('tab', v === value && 'is-selected')} onClick=${() => onChange(v)}>${text}${count ? html`<span class="tab-count">${count}</span>` : null}</button>`)}
  </div>`;
}

export function Checkbox({checked, onChange, label, disabled}) {
  return html`<button type="button" role="checkbox" aria-checked=${String(!!checked)} class=${cx('checkbox', checked && 'is-checked')} disabled=${disabled} onClick=${() => onChange(!checked)}>
    <span class="checkbox-box">${checked ? html`<${Icon} name="check"/>` : null}</span>${label ? html`<span class="checkbox-label">${label}</span>` : null}</button>`;
}
