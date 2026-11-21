/**
 * Website exceptions (Phase 3): the whitelist manager.
 *
 * The whitelist is the persisted `chrome.storage` list the worker turns into
 * allow-all dynamic rules, so it survives a restart. Adding a site asks first
 * and explains that protection drops for it; import/export move the list as
 * plain JSON (no code is ever evaluated).
 */

import { createWhitelist } from '../background/whitelist';
import { t } from '../shared/i18n';
import { logger } from '../shared/logger';
import { q } from './elements';
import { download, normalizeDomain, pickTextFile, type Ctx, type Section } from './ui';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Extracts the domain list from either a backup-shaped object or a bare array. */
function readDomains(text: string): readonly string[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return null;
  }
  const raw = Array.isArray(parsed) ? parsed : isRecord(parsed) ? parsed['whitelist'] : undefined;
  if (!Array.isArray(raw)) {
    return null;
  }
  return raw.filter((entry): entry is string => typeof entry === 'string');
}

export function createExceptions(ctx: Ctx): Section {
  const input = q<HTMLInputElement>('exc-input');
  const search = q<HTMLInputElement>('exc-search');
  const list = q('exc-list');
  const empty = q('exc-empty');
  const fileInput = q<HTMLInputElement>('exc-import-file');

  let domains: readonly string[] = [];
  let query = '';

  function render(): void {
    const shown = domains.filter((domain) => domain.includes(query));
    list.replaceChildren();
    empty.hidden = shown.length > 0;
    for (const domain of shown) {
      const item = document.createElement('li');
      const name = document.createElement('span');
      name.className = 'grow truncate';
      name.textContent = domain;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn ghost sm';
      remove.textContent = t('gRemove', ctx.locale);
      remove.addEventListener('click', () => {
        void (async () => {
          const ok = await ctx.confirm(
            t('excRemoveConfirm', ctx.locale, { domain }),
            t('excWarning', ctx.locale),
            t('gRemove', ctx.locale),
            true,
          );
          if (!ok) {
            return;
          }
          domains = await createWhitelist().setEnabled(domain, false);
          render();
        })().catch((error: unknown) => logger.error('remove whitelist failed', error));
      });
      item.append(name, remove);
      list.append(item);
    }
  }

  async function add(): Promise<void> {
    const domain = normalizeDomain(input.value);
    if (domain === '') {
      ctx.toast(t('excInvalid', ctx.locale), 'err');
      return;
    }
    if (!domains.includes(domain)) {
      const ok = await ctx.confirm(
        t('excConfirmTitle', ctx.locale),
        t('excConfirmBody', ctx.locale, { domain }),
        t('excAdd', ctx.locale),
      );
      if (!ok) {
        return;
      }
      domains = await createWhitelist().setEnabled(domain, true);
    }
    input.value = '';
    render();
  }

  async function importList(): Promise<void> {
    const text = await pickTextFile(fileInput);
    if (text === null) {
      return;
    }
    const raw = readDomains(text);
    if (raw === null) {
      ctx.toast(t('excInvalid', ctx.locale), 'err');
      return;
    }
    let count = 0;
    for (const entry of raw) {
      const domain = normalizeDomain(entry);
      if (domain === '' || domains.includes(domain)) {
        continue;
      }
      domains = await createWhitelist().setEnabled(domain, true);
      count += 1;
    }
    render();
    ctx.toast(t('excImported', ctx.locale, { count }), 'ok');
  }

  async function refresh(): Promise<void> {
    domains = await createWhitelist().list();
    render();
  }

  q('exc-add').addEventListener('click', () => {
    void add().catch((error: unknown) => logger.error('add whitelist failed', error));
  });
  q('exc-export').addEventListener('click', () => {
    const payload = JSON.stringify({ app: 'wale-guard', exportedAt: Date.now(), whitelist: domains }, null, 2);
    download('wale-guard-whitelist.json', payload);
  });
  q('exc-import').addEventListener('click', () => {
    void importList().catch((error: unknown) => logger.error('import whitelist failed', error));
  });
  search.addEventListener('input', () => {
    query = search.value.trim().toLowerCase();
    render();
  });

  return { refresh };
}
