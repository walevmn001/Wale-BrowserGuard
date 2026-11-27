import { describe, expect, it, vi } from 'vitest';

import { FLAG_NAMES, type FlagName } from '../../../src/youtube/config/flags';
import type { ModuleStatus } from '../../../src/youtube/core/module';
import { YT_STATUS_SCHEMA_VERSION } from '../../../src/youtube/state/runtime-status';
import {
  createStatusPublisher,
  type StatusPublisherDeps,
} from '../../../src/youtube/main/status-publisher';

function allFlags(value = true): Record<FlagName, boolean> {
  const flags = {} as Record<FlagName, boolean>;
  for (const name of FLAG_NAMES) {
    flags[name] = value;
  }
  return flags;
}

function moduleStatus(overrides: Partial<ModuleStatus> = {}): ModuleStatus {
  return { name: 'fetch-interceptor', enabled: true, installed: true, failures: 0, lastError: null, ...overrides };
}

function makeDeps(overrides: Partial<StatusPublisherDeps> = {}): {
  readonly deps: StatusPublisherDeps;
  readonly write: ReturnType<typeof vi.fn>;
} {
  const write = vi.fn();
  const deps: StatusPublisherDeps = {
    write,
    readModules: () => [moduleStatus()],
    readFlags: () => allFlags(),
    readUrl: () => 'https://www.youtube.com/',
    now: () => 1234,
    ...overrides,
  };
  return { deps, write };
}

describe('createStatusPublisher', () => {
  it('writes a serialised status with the schema version, time, url and modules', () => {
    const { deps, write } = makeDeps();
    createStatusPublisher(deps).publish();
    expect(write).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(write.mock.calls[0]?.[0] as string);
    expect(payload.schemaVersion).toBe(YT_STATUS_SCHEMA_VERSION);
    expect(payload.at).toBe(1234);
    expect(payload.url).toBe('https://www.youtube.com/');
    expect(payload.modules['fetch-interceptor'].installed).toBe(true);
  });

  it('dedupes an unchanged status (no second write)', () => {
    const { deps, write } = makeDeps();
    const publisher = createStatusPublisher(deps);
    publisher.publish();
    publisher.publish();
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('writes again when a module fact changes', () => {
    let installed = true;
    const { deps, write } = makeDeps({ readModules: () => [moduleStatus({ installed })] });
    const publisher = createStatusPublisher(deps);
    publisher.publish();
    installed = false;
    publisher.publish();
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('is fail-open when the write throws', () => {
    const { deps } = makeDeps({
      write: () => {
        throw new Error('attribute locked');
      },
    });
    const publisher = createStatusPublisher(deps);
    expect(() => publisher.publish()).not.toThrow();
  });

  it('is fail-open when reading the facts throws', () => {
    const { deps } = makeDeps({
      readModules: () => {
        throw new Error('registry gone');
      },
    });
    const publisher = createStatusPublisher(deps);
    expect(() => publisher.publish()).not.toThrow();
  });
});
