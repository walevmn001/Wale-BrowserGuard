/**
 * Desktop notifications (Phase 9 §9).
 *
 * Off by default: every notification kind is gated by the stored
 * `notifications` flags, so nothing fires unless the user opted in. A single
 * `id` per kind replaces any earlier notification of the same kind instead of
 * stacking them, which keeps the notification centre tidy.
 */

import { TypedStorage } from '../shared/storage';
import type { NotificationSettings } from '../shared/types';

export type NotificationKind = keyof NotificationSettings;

export const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  filterUpdate: false,
  securityBlock: false,
  protectionOff: false,
  errors: false,
};

export interface NotificationRequest {
  readonly kind: NotificationKind;
  readonly title: string;
  readonly message: string;
}

export interface NotificationsDeps {
  readonly storage: TypedStorage;
  readonly create: (
    id: string,
    options: chrome.notifications.NotificationCreateOptions,
  ) => Promise<string>;
  readonly iconUrl: string;
}

export class Notifications {
  private readonly deps: NotificationsDeps;

  constructor(deps: NotificationsDeps) {
    this.deps = deps;
  }

  async settings(): Promise<NotificationSettings> {
    return { ...DEFAULT_NOTIFICATIONS, ...(await this.deps.storage.get('notifications')) };
  }

  async setSettings(settings: NotificationSettings): Promise<void> {
    await this.deps.storage.set('notifications', settings);
  }

  /** Shows a notification only when its kind is enabled. */
  async notify(request: NotificationRequest): Promise<void> {
    if (!(await this.settings())[request.kind]) {
      return;
    }
    await this.deps.create(request.kind, {
      type: 'basic',
      iconUrl: this.deps.iconUrl,
      title: request.title,
      message: request.message,
    });
  }
}

/** Builds a notifier backed by the real `chrome.*` APIs. */
export function createNotifications(): Notifications {
  return new Notifications({
    storage: new TypedStorage(),
    create: (id, options) => chrome.notifications.create(id, options),
    iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
  });
}
