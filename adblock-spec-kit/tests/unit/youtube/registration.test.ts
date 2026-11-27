import { describe, expect, it } from 'vitest';

import {
  BRIDGE_SCRIPT_FILE,
  BRIDGE_SCRIPT_ID,
  ENGINE_SCRIPT_FILE,
  ENGINE_SCRIPT_ID,
  bridgeRegistration,
  engineRegistration,
  isEngineRegistered,
  syncEngineRegistration,
  type ContentScriptRegistration,
  type ScriptingApi,
} from '../../../src/youtube/isolated/registration';

class FakeScripting implements ScriptingApi {
  readonly ids = new Set<string>();
  readonly calls: string[] = [];
  getFails = false;
  registerFails = false;

  async getRegisteredContentScripts(): Promise<readonly { readonly id: string }[]> {
    this.calls.push('get');
    if (this.getFails) {
      throw new Error('get failed');
    }
    return [...this.ids].map((id) => ({ id }));
  }

  async registerContentScripts(scripts: readonly ContentScriptRegistration[]): Promise<void> {
    this.calls.push('register');
    if (this.registerFails) {
      throw new Error('register failed');
    }
    for (const script of scripts) {
      this.ids.add(script.id);
    }
  }

  async unregisterContentScripts(filter?: { readonly ids?: readonly string[] }): Promise<void> {
    this.calls.push('unregister');
    for (const id of filter?.ids ?? []) {
      this.ids.delete(id);
    }
  }
}

describe('engineRegistration', () => {
  it('targets the MAIN world at document_start on youtube.com', () => {
    const registration = engineRegistration();
    expect(registration.id).toBe(ENGINE_SCRIPT_ID);
    expect(registration.js).toEqual([ENGINE_SCRIPT_FILE]);
    expect(registration.runAt).toBe('document_start');
    expect(registration.world).toBe('MAIN');
    expect(registration.matches).toEqual(['*://*.youtube.com/*']);
  });
});

describe('bridgeRegistration', () => {
  it('targets the ISOLATED world at document_start on youtube.com', () => {
    const registration = bridgeRegistration();
    expect(registration.id).toBe(BRIDGE_SCRIPT_ID);
    expect(registration.js).toEqual([BRIDGE_SCRIPT_FILE]);
    expect(registration.runAt).toBe('document_start');
    expect(registration.world).toBe('ISOLATED');
    expect(registration.matches).toEqual(['*://*.youtube.com/*']);
  });
});

describe('syncEngineRegistration', () => {
  it('registers both engine scripts when enabled and absent', async () => {
    const api = new FakeScripting();
    const result = await syncEngineRegistration(api, true);
    expect(result).toEqual({ ok: true });
    expect(api.ids.has(ENGINE_SCRIPT_ID)).toBe(true);
    expect(api.ids.has(BRIDGE_SCRIPT_ID)).toBe(true);
  });

  it('is idempotent: a second enable does not register again', async () => {
    const api = new FakeScripting();
    await syncEngineRegistration(api, true);
    await syncEngineRegistration(api, true);
    expect(api.calls.filter((call) => call === 'register')).toHaveLength(1);
  });

  it('unregisters both engine scripts when disabled and present', async () => {
    const api = new FakeScripting();
    await syncEngineRegistration(api, true);
    const result = await syncEngineRegistration(api, false);
    expect(result).toEqual({ ok: true });
    expect(api.ids.has(ENGINE_SCRIPT_ID)).toBe(false);
    expect(api.ids.has(BRIDGE_SCRIPT_ID)).toBe(false);
  });

  it('is a no-op when disabling and already absent', async () => {
    const api = new FakeScripting();
    const result = await syncEngineRegistration(api, false);
    expect(result).toEqual({ ok: true });
    expect(api.calls).not.toContain('unregister');
    expect(api.calls).not.toContain('register');
  });

  it('is fail-open when the scripting API throws', async () => {
    const api = new FakeScripting();
    api.getFails = true;
    const result = await syncEngineRegistration(api, true);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('get failed');
  });

  it('is fail-open when registration throws', async () => {
    const api = new FakeScripting();
    api.registerFails = true;
    await expect(syncEngineRegistration(api, true)).resolves.toMatchObject({ ok: false });
  });
});

describe('isEngineRegistered', () => {
  it('is true only once both engine scripts are registered', async () => {
    const api = new FakeScripting();
    expect(await isEngineRegistered(api)).toBe(false);
    await syncEngineRegistration(api, true);
    expect(await isEngineRegistered(api)).toBe(true);
  });

  it('is false when only one of the two scripts is registered', async () => {
    const api = new FakeScripting();
    api.ids.add(ENGINE_SCRIPT_ID);
    expect(await isEngineRegistered(api)).toBe(false);

    const api2 = new FakeScripting();
    api2.ids.add(BRIDGE_SCRIPT_ID);
    expect(await isEngineRegistered(api2)).toBe(false);
  });

  it('is false (never throws) when the scripting API throws', async () => {
    const api = new FakeScripting();
    api.getFails = true;
    await expect(isEngineRegistered(api)).resolves.toBe(false);
  });
});

describe('syncEngineRegistration — partial state', () => {
  it('converges a half-registered module by registering only the missing script', async () => {
    const api = new FakeScripting();
    api.ids.add(ENGINE_SCRIPT_ID);
    const result = await syncEngineRegistration(api, true);
    expect(result).toEqual({ ok: true });
    expect(api.ids.has(BRIDGE_SCRIPT_ID)).toBe(true);
    expect(api.ids.has(ENGINE_SCRIPT_ID)).toBe(true);
  });

  it('unregisters both scripts when disabling from a partial state', async () => {
    const api = new FakeScripting();
    api.ids.add(ENGINE_SCRIPT_ID);
    const result = await syncEngineRegistration(api, false);
    expect(result).toEqual({ ok: true });
    expect(api.ids.has(ENGINE_SCRIPT_ID)).toBe(false);
    expect(api.ids.has(BRIDGE_SCRIPT_ID)).toBe(false);
  });
});
