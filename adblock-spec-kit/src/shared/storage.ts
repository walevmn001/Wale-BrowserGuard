import type { StorageSchema } from './types';

export type StorageKey = keyof StorageSchema;

/**
 * Type-safe wrapper around a `chrome.storage` area.
 *
 * The area is injected so unit tests can pass a fake; in production it defaults
 * to `chrome.storage.local`. All persisted state goes through here so the set
 * of keys is validated at compile time (Constitution 14).
 */
export class TypedStorage {
  private readonly area: chrome.storage.StorageArea;

  constructor(area?: chrome.storage.StorageArea) {
    this.area = area ?? chrome.storage.local;
  }

  async get<K extends StorageKey>(key: K): Promise<StorageSchema[K] | undefined> {
    const items = (await this.area.get(key)) as Partial<StorageSchema>;

    return items[key];
  }

  async set<K extends StorageKey>(key: K, value: StorageSchema[K]): Promise<void> {
    await this.area.set({ [key]: value });
  }

  /**
   * Writes several keys at once — used by settings sync to apply a whole remote
   * group atomically (T081). The keys stay type-checked by `Partial`.
   */
  async apply(items: Partial<StorageSchema>): Promise<void> {
    await this.area.set(items);
  }

  async remove(key: StorageKey): Promise<void> {
    await this.area.remove(key);
  }
}
