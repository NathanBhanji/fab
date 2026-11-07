import type { Action } from "expo-quick-actions";

const NEW_TASK_SHORTCUT_HREF = "/new";

const THREAD_SHORTCUT_HREF_PATTERN = /^\/threads\/[^/?#]+\/[^/?#]+$/;

/** Shortcuts survive updates; allowlist destinations so malformed or stale paths cannot navigate. */
export function shortcutHref(action: Action): string | null {
  const href = action.params?.href;
  if (typeof href !== "string") {
    return null;
  }

  return href === NEW_TASK_SHORTCUT_HREF || THREAD_SHORTCUT_HREF_PATTERN.test(href) ? href : null;
}
