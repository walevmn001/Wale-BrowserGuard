/**
 * Local-only logger.
 *
 * The extension never sends logs anywhere (Constitution 4). Every message is
 * prefixed so it is easy to filter the console.
 */
const PREFIX = '[adblock]';

export const logger = {
  debug(...args: unknown[]): void {
    console.debug(PREFIX, ...args);
  },
  info(...args: unknown[]): void {
    console.info(PREFIX, ...args);
  },
  warn(...args: unknown[]): void {
    console.warn(PREFIX, ...args);
  },
  error(...args: unknown[]): void {
    console.error(PREFIX, ...args);
  },
} as const;
