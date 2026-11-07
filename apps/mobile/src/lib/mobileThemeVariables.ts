import defaultThemeVariables from "../../generated-uniwind-default-theme-variables.json";
import {
  DEFAULT_MOBILE_THEME_ID,
  getMobileThemeVariables,
  themeColorWithAlpha,
  type MobileThemeAppearance,
  type MobileThemeId,
  type MobileThemeVariables,
} from "./mobileTheme";

const defaults = defaultThemeVariables as Readonly<
  Record<MobileThemeAppearance, MobileThemeVariables>
>;

export function getMobileThemeRuntimeVariables(
  themeId: MobileThemeId,
  appearance: MobileThemeAppearance,
  platform: string,
): MobileThemeVariables {
  const usesDefaultPalette = themeId === DEFAULT_MOBILE_THEME_ID;
  const variables = usesDefaultPalette
    ? defaults[appearance]
    : getMobileThemeVariables(themeId, appearance);
  if (platform !== "ios" || !usesDefaultPalette || appearance !== "light") return variables;
  const frame = themeColorWithAlpha(variables["--color-row-hover"], 1);
  return {
    ...variables,
    "--color-header": frame,
    "--color-header-foreground": variables["--color-drawer-foreground"],
    "--color-drawer": frame,
    "--color-drawer-foreground-muted": variables["--color-foreground-muted"],
  };
}
