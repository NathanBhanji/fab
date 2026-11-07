import * as QuickActions from "expo-quick-actions";

import { shortcutHref } from "./appShortcuts";

/** App-lifetime quick actions. `navigate` must queue until navigation is ready. */
export function installAppShortcuts(navigate: (href: string) => void): () => void {
  const initialHref = QuickActions.initial ? shortcutHref(QuickActions.initial) : null;
  if (initialHref !== null) navigate(initialHref);
  const subscription = QuickActions.addListener((action) => {
    const href = shortcutHref(action);
    if (href !== null) navigate(href);
  });
  return () => subscription.remove();
}
