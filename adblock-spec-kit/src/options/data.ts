/**
 * Data (Phase 9 §6): local storage usage, configuration backup/restore and the
 * shortcuts to clear the activity log and statistics.
 *
 * Backups carry configuration only (never stats or the log) and every imported
 * file is re-validated by `parseBackup`, which drops unknown keys and never
 * evaluates anything as code.
 */

import { createActivityLog } from '../background/activity';
import { BACKUP_KEYS, parseBackup, serializeBackup, type BackupKey } from '../background/backup';
import { createStatsCounter } from '../background/stats';
import { t } from '../shared/i18n';
import { logger } from '../shared/logger';
import type { StorageSchema } from '../shared/types';
import { q } from './elements';
import { download, formatBytes, pickTextFile, type Ctx, type Section } from './ui';

export function createData(ctx: Ctx): Section {
  const storageText = q('data-storage');
  const storageChip = q('data-storage-chip');
  const fileInput = q<HTMLInputElement>('data-import-file');

  async function refresh(): Promise<void> {
    const all = await chrome.storage.local.get(null);
    const bytes = new TextEncoder().encode(JSON.stringify(all)).length;
    storageText.textContent = formatBytes(bytes);
    storageChip.textContent = String(Object.keys(all).length);
    storageChip.title = t('dataStorage', ctx.locale);
  }

  async function exportBackup(): Promise<void> {
    const data = (await chrome.storage.local.get([...BACKUP_KEYS])) as Partial<
      Pick<StorageSchema, BackupKey>
    >;
    download('wale-guard-backup.json', serializeBackup(data));
    ctx.toast(t('dataExported', ctx.locale), 'ok');
  }

  async function importBackup(): Promise<void> {
    const text = await pickTextFile(fileInput);
    if (text === null) {
      return;
    }
    const parsed = parseBackup(text);
    if (!parsed.ok) {
      ctx.toast(t('dataImportInvalid', ctx.locale), 'err');
      return;
    }
    await chrome.storage.local.set(parsed.data);
    await refresh();
    ctx.toast(t('dataImported', ctx.locale), 'ok');
  }

  q('data-export').addEventListener('click', () => {
    void exportBackup().catch((error: unknown) => logger.error('export failed', error));
  });
  q('data-import').addEventListener('click', () => {
    void importBackup().catch((error: unknown) => logger.error('import failed', error));
  });
  q('data-clear-logs').addEventListener('click', () => {
    void (async () => {
      const ok = await ctx.confirm(
        t('dataClearLogs', ctx.locale),
        t('actEmptyDesc', ctx.locale),
        t('dataClearLogs', ctx.locale),
        true,
      );
      if (!ok) {
        return;
      }
      await createActivityLog().clear();
      ctx.toast(t('dataCleared', ctx.locale), 'ok');
      await refresh();
    })().catch((error: unknown) => logger.error('clear logs failed', error));
  });
  q('data-clear-stats').addEventListener('click', () => {
    void (async () => {
      const ok = await ctx.confirm(
        t('dataClearStats', ctx.locale),
        t('dataIncludes', ctx.locale),
        t('dataClearStats', ctx.locale),
        true,
      );
      if (!ok) {
        return;
      }
      await createStatsCounter().reset();
      ctx.toast(t('dataCleared', ctx.locale), 'ok');
      await refresh();
    })().catch((error: unknown) => logger.error('clear stats failed', error));
  });

  return { refresh };
}
