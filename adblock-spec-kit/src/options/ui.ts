/**
 * Dashboard UI primitives (Phase 12): toasts, the shared confirm dialog, file
 * helpers and a local storage-usage estimate. Pure DOM — nothing is fetched and
 * no value is ever parsed as markup.
 */

import type { Locale } from '../shared/i18n';
import { TypedStorage } from '../shared/storage';
import { q } from './elements';

export type ToastTone = 'ok' | 'err' | 'warn';

/** A section contributes a `refresh()` that re-paints itself from storage. */
export interface Section {
  refresh(): Promise<void>;
}

/** Everything a section needs from the shell. */
export interface Ctx {
  readonly locale: Locale;
  readonly storage: TypedStorage;
  toast(message: string, tone?: ToastTone): void;
  confirm(title: string, body: string, ok: string, danger?: boolean): Promise<boolean>;
  open(section: string): void;
}

interface ConfirmRequest {
  readonly title: string;
  readonly body: string;
  readonly ok: string;
  readonly danger?: boolean;
}

/** Transient toast messages anchored at the bottom-right of the page. */
function createToaster(): (message: string, tone: ToastTone) => void {
  const host = q('toasts');
  return (message, tone) => {
    const toast = document.createElement('div');
    toast.className = `toast ${tone}`;
    toast.setAttribute('role', 'status');
    toast.textContent = message;
    host.append(toast);
    setTimeout(() => toast.remove(), 3600);
  };
}

/** Promise-based wrapper over the shared `<dialog id="confirm">`. */
function createConfirm(): (req: ConfirmRequest) => Promise<boolean> {
  const dialog = q<HTMLDialogElement>('confirm');
  const titleEl = q('confirm-title');
  const bodyEl = q('confirm-body');
  const okEl = q<HTMLButtonElement>('confirm-ok');
  const cancelEl = q<HTMLButtonElement>('confirm-cancel');

  return (req) =>
    new Promise<boolean>((resolve) => {
      titleEl.textContent = req.title;
      bodyEl.textContent = req.body;
      okEl.textContent = req.ok;
      okEl.className = req.danger === true ? 'btn danger' : 'btn';
      const finish = (value: boolean): void => {
        okEl.removeEventListener('click', onOk);
        cancelEl.removeEventListener('click', onCancel);
        dialog.removeEventListener('close', onCancel);
        if (dialog.open) {
          dialog.close();
        }
        resolve(value);
      };
      const onOk = (): void => finish(true);
      const onCancel = (): void => finish(false);
      okEl.addEventListener('click', onOk);
      cancelEl.addEventListener('click', onCancel);
      dialog.addEventListener('close', onCancel);
      dialog.showModal();
    });
}

/** Builds the shell context every section receives. */
export function createContext(locale: Locale): Ctx {
  const storage = new TypedStorage();
  const toast = createToaster();
  const confirm = createConfirm();
  return {
    locale,
    storage,
    toast: (message, tone = 'ok') => toast(message, tone),
    confirm: (title, body, ok, danger) =>
      confirm(danger === undefined ? { title, body, ok } : { title, body, ok, danger }),
    open: (section) => {
      window.location.hash = section;
    },
  };
}

/** Saves `text` to the user's machine as a download (no server involved). */
export function download(filename: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Opens the hidden file input and resolves with its text, or `null`. */
export function pickTextFile(input: HTMLInputElement): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    input.addEventListener(
      'change',
      () => {
        const file = input.files?.[0];
        input.value = '';
        if (file === undefined) {
          resolve(null);
          return;
        }
        file
          .text()
          .then(resolve)
          .catch(() => resolve(null));
      },
      { once: true },
    );
    input.click();
  });
}

/** UTF-8 size of everything this extension has stored locally. */
export async function storageBytes(): Promise<number> {
  const all = await chrome.storage.local.get(null);
  return new TextEncoder().encode(JSON.stringify(all)).length;
}

/** Human-readable byte size for the data / diagnostics panels. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** `HH:MM` in the user's timezone, for pause/expiry chips. */
export function clock(time: number): string {
  const date = new Date(time);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Normalises a user-typed domain: lower-case host, no scheme, path or port. */
export function normalizeDomain(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === '') {
    return '';
  }
  try {
    return new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`).hostname;
  } catch {
    return '';
  }
}
