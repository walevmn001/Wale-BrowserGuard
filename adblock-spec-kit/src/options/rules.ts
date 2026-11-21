/**
 * Custom rules (Phase 9 §5): a small, validated subset of ABP syntax.
 *
 * `CustomRules` re-validates every entry before it becomes a DNR rule, so the
 * UI can only ever store host-suffix rules — never anything executed as code.
 * Import/export move rule text as JSON.
 */

import { createCustomRules } from '../background/custom-rules';
import { t, type MessageKey } from '../shared/i18n';
import { logger } from '../shared/logger';
import type { CustomRule } from '../shared/types';
import { q } from './elements';
import { download, pickTextFile, type Ctx, type Section } from './ui';

type RuleReason = 'invalid' | 'unsupported' | 'tooBroad';

const REASON_KEY: Record<RuleReason, MessageKey> = {
  invalid: 'reasonInvalid',
  unsupported: 'reasonUnsupported',
  tooBroad: 'reasonTooBroad',
};

/** Reads the rule-text list from either `{rules:[…]}` or a bare array. */
function readRules(text: string): readonly string[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return null;
  }
  const source =
    Array.isArray(parsed) ? parsed : typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)['rules']
      : undefined;
  if (!Array.isArray(source)) {
    return null;
  }
  return source.filter((entry): entry is string => typeof entry === 'string');
}

export function createRules(ctx: Ctx): Section {
  const input = q<HTMLInputElement>('rul-input');
  const error = q('rul-error');
  const list = q('rul-list');
  const empty = q('rul-empty');
  const fileInput = q<HTMLInputElement>('rul-import-file');

  function showError(reason: RuleReason): void {
    error.hidden = false;
    error.textContent = t('rulInvalid', ctx.locale, { reason: t(REASON_KEY[reason], ctx.locale) });
  }

  function render(rules: readonly CustomRule[]): void {
    list.replaceChildren();
    empty.hidden = rules.length > 0;
    for (const rule of rules) {
      const item = document.createElement('li');
      const text = document.createElement('span');
      text.className = 'grow mono truncate';
      text.textContent = rule.text;
      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.checked = rule.enabled;
      toggle.addEventListener('change', () => {
        void createCustomRules()
          .setEnabled(rule.id, toggle.checked)
          .catch((err: unknown) => logger.error('toggle rule failed', err));
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn ghost sm';
      remove.textContent = t('gRemove', ctx.locale);
      remove.addEventListener('click', () => {
        void createCustomRules()
          .remove(rule.id)
          .then(refresh)
          .catch((err: unknown) => logger.error('remove rule failed', err));
      });
      item.append(toggle, text, remove);
      list.append(item);
    }
  }

  async function refresh(): Promise<void> {
    render(await createCustomRules().list());
  }

  async function add(): Promise<void> {
    const result = await createCustomRules().add(input.value);
    if (!result.ok) {
      showError(result.reason);
      return;
    }
    error.hidden = true;
    input.value = '';
    await refresh();
  }

  async function importRules(): Promise<void> {
    const text = await pickTextFile(fileInput);
    if (text === null) {
      return;
    }
    const rules = readRules(text);
    if (rules === null) {
      ctx.toast(t('dataImportInvalid', ctx.locale), 'err');
      return;
    }
    await createCustomRules().replaceAll(rules);
    error.hidden = true;
    await refresh();
  }

  q('rul-add').addEventListener('click', () => {
    void add().catch((err: unknown) => logger.error('add rule failed', err));
  });
  q('rul-export').addEventListener('click', () => {
    void (async () => {
      const rules = await createCustomRules().list();
      const payload = JSON.stringify(
        { app: 'wale-guard', exportedAt: Date.now(), rules: rules.map((rule) => rule.text) },
        null,
        2,
      );
      download('wale-guard-rules.json', payload);
    })().catch((err: unknown) => logger.error('export rules failed', err));
  });
  q('rul-import').addEventListener('click', () => {
    void importRules().catch((err: unknown) => logger.error('import rules failed', err));
  });

  return { refresh };
}
