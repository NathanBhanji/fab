import { HTML_RENDER_DEFAULT_FONTS, htmlRenderTheme } from "@fab/shared/htmlRender";

import {
  getMobileThemeColors,
  nativeColors,
  type MobileThemeAppearance,
  type MobileThemeId,
  type MobileThemeVariables,
} from "./mobileTheme";

/** WebViews cannot load bundled app fonts; use system stacks. */
export function mobileHtmlRenderTheme(input: {
  readonly themeId: MobileThemeId;
  readonly appearance: MobileThemeAppearance;
  readonly variables: MobileThemeVariables;
}) {
  const colors = nativeColors(getMobileThemeColors(input.themeId, input.appearance));
  const canvas = input.variables["--color-screen"];
  return htmlRenderTheme({ ...colors, canvas }, input.appearance, HTML_RENDER_DEFAULT_FONTS);
}
