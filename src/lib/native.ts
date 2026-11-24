import { invoke } from '@tauri-apps/api/core';

/** True only inside the Tauri desktop webview. */
export function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  const scope = window as unknown as Record<string, unknown>;
  return '__TAURI_INTERNALS__' in scope || '__TAURI__' in scope;
}

/**
 * Use the webview's own zoom level in the desktop shell. This keeps pointer
 * coordinates, React Flow dragging and the caret in sync, unlike CSS zoom.
 * Returns false outside Tauri or if the command is unavailable.
 */
export async function setNativeUiScale(scale: number): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  try {
    await invoke('set_ui_zoom', { scale });
    return true;
  } catch (error) {
    console.warn('Native UI scale is unavailable, falling back to CSS zoom', error);
    return false;
  }
}
