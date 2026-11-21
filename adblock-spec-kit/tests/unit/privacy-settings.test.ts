import { describe, expect, it } from 'vitest';

import {
  PrivacySettings,
  WEBRTC_PROTECTED_POLICY,
  isControllable,
  type WebRtcPolicy,
} from '../../src/background/security/privacy-settings';
import { TypedStorage } from '../../src/shared/storage';

type LevelOfControl = `${chrome.types.LevelOfControl}`;

function createFakeArea(): chrome.storage.StorageArea {
  const store = new Map<string, unknown>();
  return {
    get: async (key: string): Promise<Record<string, unknown>> =>
      store.has(key) ? { [key]: store.get(key) } : {},
    set: async (items: Record<string, unknown>): Promise<void> => {
      for (const [key, value] of Object.entries(items)) {
        store.set(key, value);
      }
    },
    remove: async (key: string): Promise<void> => {
      store.delete(key);
    },
  } as unknown as chrome.storage.StorageArea;
}

interface Harness {
  readonly settings: PrivacySettings;
  readonly setCalls: WebRtcPolicy[];
  readonly clearCalls: number[];
  setControl(level: LevelOfControl): void;
}

function createHarness(): Harness {
  const setCalls: WebRtcPolicy[] = [];
  const clearCalls: number[] = [];
  let control: LevelOfControl = 'controllable_by_this_extension';
  const settings = new PrivacySettings({
    storage: new TypedStorage(createFakeArea()),
    getControl: async () => control,
    setPolicy: async (value) => {
      setCalls.push(value);
    },
    clearPolicy: async () => {
      clearCalls.push(clearCalls.length + 1);
    },
  });
  return {
    settings,
    setCalls,
    clearCalls,
    setControl: (level) => {
      control = level;
    },
  };
}

describe('isControllable', () => {
  it('is true only when this extension may set the value', () => {
    expect(isControllable('controllable_by_this_extension')).toBe(true);
    expect(isControllable('controlled_by_this_extension')).toBe(true);
    expect(isControllable('controlled_by_other_extensions')).toBe(false);
    expect(isControllable('not_controllable')).toBe(false);
  });
});

describe('PrivacySettings', () => {
  it('is off by default, so WebRTC is left untouched until the user opts in', async () => {
    const { settings, setCalls, clearCalls } = createHarness();

    await expect(settings.isEnabled()).resolves.toBe(false);
    await settings.applyStored();

    expect(setCalls).toEqual([]);
    expect(clearCalls).toHaveLength(1);
  });

  it('setEnabled(true) persists the choice and restricts WebRTC (AC-6.4)', async () => {
    const { settings, setCalls } = createHarness();

    await settings.setEnabled(true);

    await expect(settings.isEnabled()).resolves.toBe(true);
    expect(setCalls).toEqual([WEBRTC_PROTECTED_POLICY]);
  });

  it('setEnabled(false) persists the choice and restores the browser default', async () => {
    const { settings, setCalls, clearCalls } = createHarness();

    await settings.setEnabled(true);
    await settings.setEnabled(false);

    await expect(settings.isEnabled()).resolves.toBe(false);
    expect(setCalls).toEqual([WEBRTC_PROTECTED_POLICY]);
    expect(clearCalls).toHaveLength(1);
  });

  it('applyStored re-applies an enabled choice on startup', async () => {
    const { settings, setCalls } = createHarness();

    await settings.setEnabled(true);
    setCalls.length = 0;

    await expect(settings.applyStored()).resolves.toBe(true);
    expect(setCalls).toEqual([WEBRTC_PROTECTED_POLICY]);
  });

  it('leaves the policy alone when another party has taken control', async () => {
    const { settings, setCalls, clearCalls, setControl } = createHarness();
    setControl('controlled_by_other_extensions');

    await settings.setEnabled(true);

    // The choice is still stored, but the setting is not touched.
    await expect(settings.isEnabled()).resolves.toBe(true);
    expect(setCalls).toEqual([]);
    expect(clearCalls).toEqual([]);
  });
});
