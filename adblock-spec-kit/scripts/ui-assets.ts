/**
 * Static UI assets copied verbatim into `dist/` (T070).
 *
 * The design tokens, the shared component stylesheet and the icons are plain
 * files — not script imports — so the build copies them at fixed (unhashed)
 * paths instead of letting Vite rename them. Pages link them with a relative
 * URL (`../../shared/ui/components.css` from `src/<page>/index.html`).
 *
 * The icon list also feeds the manifest (`icons` / `action.default_icon`), so
 * the emitted paths and the manifest paths can never drift apart.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface UiAsset {
  /** Path relative to the project root. */
  readonly from: string;
  /** Path relative to `dist/`. */
  readonly to: string;
}

/** Icon pixel sizes Chrome asks for; rasterised from `src/shared/ui/icon.svg`. */
export const ICON_SIZES = [16, 32, 48, 128] as const;

/** Manifest-relative path of the PNG for a given size, e.g. `icons/icon-128.png`. */
export function iconPath(size: number): string {
  return `icons/icon-${size}.png`;
}

export const UI_ASSETS: readonly UiAsset[] = [
  { from: 'src/shared/ui/design-tokens.css', to: 'src/shared/ui/design-tokens.css' },
  { from: 'src/shared/ui/components.css', to: 'src/shared/ui/components.css' },
  { from: 'src/shared/ui/dashboard.css', to: 'src/shared/ui/dashboard.css' },
  { from: 'src/shared/ui/icon.svg', to: 'src/shared/ui/icon.svg' },
  { from: 'src/shared/ui/fonts/inter-latin.woff2', to: 'src/shared/ui/fonts/inter-latin.woff2' },
  {
    from: 'src/shared/ui/fonts/inter-vietnamese.woff2',
    to: 'src/shared/ui/fonts/inter-vietnamese.woff2',
  },
  { from: 'src/shared/ui/fonts/OFL.txt', to: 'src/shared/ui/fonts/OFL.txt' },
  ...ICON_SIZES.map((size) => ({
    from: `src/shared/ui/icons/icon-${size}.png`,
    to: iconPath(size),
  })),
];

/** Reads one asset's bytes from disk, relative to `root`. */
export function readUiAsset(root: string, asset: UiAsset): Buffer {
  return readFileSync(join(root, asset.from));
}

/** `icons` map for the manifest: pixel size (string) -> emitted PNG path. */
export function iconManifestEntries(): Record<string, string> {
  return Object.fromEntries(ICON_SIZES.map((size) => [String(size), iconPath(size)]));
}
