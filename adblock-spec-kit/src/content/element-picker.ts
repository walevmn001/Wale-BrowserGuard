/**
 * Element picker — Phase 9 §4 (UI/UX spec §4.4).
 *
 * A page-side tool, opened from the popup, that hides one annoying element (a
 * leftover ad slot, a sticky banner). It renders **entirely inside a Shadow
 * DOM** so the host page's CSS can never reach it, and its own styles can never
 * leak out and break the page (AC-UI-7): the host element is pinned with
 * `!important`, the shadow tree is unreachable by page selectors.
 *
 * It runs via `chrome.scripting.executeScript`, which serialises the function
 * with `Function.prototype.toString()` — so every helper is declared **inside**
 * it and every value arrives as a parameter. It uses the literal
 * `'wg:hide-element'`, kept in sync by `tests/unit/messages.test.ts`.
 */
import type { PickerOptions } from './picker-config.ts';

export type { PickerLabels, PickerOptions } from './picker-config.ts';

export function installElementPicker(options: PickerOptions): void {
  // NOTE: serialised via `Function.prototype.toString()` — params + page globals only.
  const HIDE_ELEMENT = 'wg:hide-element';
  const scope = window as unknown as Record<string, unknown>;
  if (scope['__waleGuardPicker'] === true) {
    return;
  }
  scope['__waleGuardPicker'] = true;

  const labels = options.labels;
  const cap = options.maxLength;

  /** Escapes a token so it is safe inside a CSS selector (minimal `CSS.escape`). */
  function escapeToken(value: string): string {
    let out = '';
    for (let index = 0; index < value.length; index += 1) {
      const character = value.charAt(index);
      if (/[a-zA-Z0-9_-]/.test(character) && !(index === 0 && /[0-9]/.test(character))) {
        out += character;
      } else {
        out += `\\${(character.codePointAt(0) ?? 0).toString(16)} `;
      }
    }
    return out;
  }

  /** True when `selector` parses and matches exactly one element. */
  function unique(selector: string): boolean {
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch {
      return false;
    }
  }

  /** Shortest unique selector for `element`: a unique id, then a class combo,
   * then an ancestor path with `:nth-of-type`. Never `*` or a bare tag. */
  function selectorFor(element: Element): string {
    const id = element.getAttribute('id');
    if (id !== null && id.trim() !== '') {
      const candidate = `#${escapeToken(id.trim())}`;
      if (unique(candidate)) {
        return candidate.slice(0, cap);
      }
    }
    const classes = Array.from(element.classList).filter((name) => name.trim() !== '');
    if (classes.length > 0) {
      const candidate = `${element.tagName.toLowerCase()}.${classes.map(escapeToken).join('.')}`;
      if (unique(candidate)) {
        return candidate.slice(0, cap);
      }
    }
    const parts: string[] = [];
    let current: Element | null = element;
    for (let depth = 0; current !== null && depth < 6; depth += 1) {
      let part = current.tagName.toLowerCase();
      const parent: Element | null = current.parentElement;
      if (parent !== null) {
        const tag = current.tagName;
        const siblings = Array.from(parent.children).filter((child) => child.tagName === tag);
        if (siblings.length > 1) {
          part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
        }
      }
      parts.unshift(part);
      const candidate = parts.join(' > ');
      if (unique(candidate)) {
        return candidate.slice(0, cap);
      }
      current = parent;
    }
    return parts.join(' > ').slice(0, cap);
  }

  /** Local pre-check mirroring `shared/selector.ts`; the worker re-validates. */
  function localReason(selector: string): string | undefined {
    const value = selector.trim();
    if (value === '') {
      return 'empty';
    }
    if (value.length > cap) {
      return 'tooLong';
    }
    if (/[{};<>@\\]/.test(value) || value.includes('/*')) {
      return 'invalid';
    }
    if (/^[>+~,\s]/.test(value) || /[>+~,\s]$/.test(value) || !/[a-z#.[]/i.test(value)) {
      return 'tooBroad';
    }
    return undefined;
  }

  const host = document.createElement('div');
  host.id = 'wale-guard-picker';
  // `all: initial` cuts inherited values from the page; each longhand after it
  // (same inline specificity, set later → wins) restores what the UI needs.
  host.style.setProperty('all', 'initial', 'important');
  host.style.setProperty('position', 'fixed', 'important');
  host.style.setProperty('inset', '0', 'important');
  host.style.setProperty('z-index', '2147483647', 'important');
  host.style.setProperty('pointer-events', 'none', 'important');
  host.style.setProperty('display', 'block', 'important');

  const stylesheet = document.createElement('style');
  stylesheet.textContent = options.styles;
  const overlay = document.createElement('div');
  overlay.setAttribute('data-role', 'overlay');
  const tag = document.createElement('div');
  tag.setAttribute('data-role', 'label');
  const bar = document.createElement('div');
  bar.setAttribute('data-role', 'bar');
  bar.setAttribute('role', 'dialog');
  bar.setAttribute('aria-label', labels.title);
  bar.hidden = true;
  const status = document.createElement('span');
  status.setAttribute('data-role', 'status');
  status.textContent = labels.hint;

  function makeButton(act: string, text: string, variant: string): HTMLButtonElement {
    const element = document.createElement('button');
    element.type = 'button';
    element.setAttribute('data-act', act);
    element.setAttribute('data-variant', variant);
    element.textContent = text;
    return element;
  }
  const confirmButton = makeButton('confirm', labels.confirm, 'primary');
  const undoButton = makeButton('undo', labels.undo, 'ghost');
  const cancelButton = makeButton('cancel', labels.cancel, 'ghost');
  bar.append(status, undoButton, confirmButton, cancelButton);
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.append(stylesheet, overlay, tag, bar);
  document.documentElement.append(host);

  let locked: Element | undefined;
  let saved: { element: Element; value: string; priority: string } | undefined;

  function setStatus(text: string): void {
    status.textContent = text;
  }
  function paint(element: Element, reason: string | undefined): void {
    const rect = element.getBoundingClientRect();
    const reject = String(reason !== undefined);
    overlay.style.left = `${rect.left}px`;
    overlay.style.top = `${rect.top}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    overlay.setAttribute('data-reject', reject);
    tag.textContent = selectorFor(element);
    tag.setAttribute('data-reject', reject);
    const top = rect.top > 40 ? rect.top - 26 : rect.bottom + 6;
    tag.style.top = `${Math.max(4, top)}px`;
    tag.style.left = `${Math.max(4, Math.min(rect.left, window.innerWidth - 240))}px`;
  }
  function restoreLocked(): void {
    if (saved === undefined) {
      return;
    }
    const styled = saved.element as HTMLElement;
    if (saved.value === '') {
      styled.style.removeProperty('display');
    } else {
      styled.style.setProperty('display', saved.value, saved.priority);
    }
    saved = undefined;
  }
  function previewHide(element: Element): void {
    restoreLocked();
    const styled = element as HTMLElement;
    saved = {
      element,
      value: styled.style.getPropertyValue('display'),
      priority: styled.style.getPropertyPriority('display'),
    };
    styled.style.setProperty('display', 'none', 'important');
  }
  function teardown(): void {
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKey, true);
    host.remove();
    scope['__waleGuardPicker'] = undefined;
  }
  function cancel(): void {
    restoreLocked();
    teardown();
  }
  function select(element: Element): void {
    locked = element;
    const reason = localReason(selectorFor(element));
    paint(element, reason);
    setStatus(reason === undefined ? labels.hint : (labels.reasons[reason] ?? labels.hint));
    if (reason === undefined) {
      previewHide(element);
    }
    bar.hidden = false;
  }
  function onMove(event: MouseEvent): void {
    const target = event.target;
    if (locked !== undefined || !(target instanceof Element) || host.contains(target)) {
      return;
    }
    if (target === document.documentElement || target === document.body) {
      overlay.style.width = '0px';
      overlay.style.height = '0px';
      return;
    }
    paint(target, localReason(selectorFor(target)));
  }
  function onClick(event: MouseEvent): void {
    const target = event.target;
    if (
      !(target instanceof Element) ||
      host.contains(target) ||
      target === document.documentElement ||
      target === document.body
    ) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    select(target);
  }
  function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    }
  }
  function onUndo(): void {
    restoreLocked();
    locked = undefined;
    bar.hidden = true;
    setStatus(labels.hint);
    overlay.style.width = '0px';
    overlay.style.height = '0px';
  }
  function onConfirm(): void {
    if (locked === undefined) {
      return;
    }
    const selector = selectorFor(locked);
    const reason = localReason(selector);
    if (reason !== undefined) {
      setStatus(labels.reasons[reason] ?? labels.hint);
      return;
    }
    const runtime = (globalThis as unknown as { chrome?: { runtime?: unknown } }).chrome?.runtime as
      | { sendMessage?: (message: unknown) => Promise<unknown> }
      | undefined;
    const send = runtime?.sendMessage?.bind(runtime);
    if (send === undefined) {
      setStatus(labels.reasons['failed'] ?? labels.hint);
      return;
    }
    confirmButton.disabled = true;
    void send({ type: HIDE_ELEMENT, selector })
      .then((reply) => {
        confirmButton.disabled = false;
        if ((reply as { ok?: boolean } | undefined)?.ok !== true) {
          const code = String((reply as { reason?: string } | undefined)?.reason ?? 'failed');
          setStatus(labels.reasons[code] ?? labels.reasons['failed'] ?? labels.hint);
          return;
        }
        setStatus(labels.hidden);
        saved = undefined; // the injected CSS now hides it; forget the preview
        locked = undefined;
        setTimeout(teardown, 600);
      })
      .catch(() => {
        confirmButton.disabled = false;
        setStatus(labels.reasons['failed'] ?? labels.hint);
      });
  }

  confirmButton.addEventListener('click', onConfirm);
  undoButton.addEventListener('click', onUndo);
  cancelButton.addEventListener('click', cancel);
  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKey, true);
}
