import {
  flattenThemeColor,
  themeColorWithAlpha,
  themeColorWithContrast,
  type MobileThemeAppearance,
  type MobileThemeId,
  type MobileThemeVariables,
} from "../../lib/mobileTheme";
import type { SegmentedControlProps } from "./SegmentedControl.types";

export function segmentedControlColors(
  colors: MobileThemeVariables,
  appearance: MobileThemeAppearance,
  variant: SegmentedControlProps<string>["variant"],
  themeId: MobileThemeId,
) {
  const dark = appearance === "dark";
  const card = variant === "card";
  const accent = colors["--color-prominent-action"];
  const trackColor = card
    ? dark
      ? colors["--color-screen"]
      : flattenThemeColor(
          themeColorWithAlpha(colors["--color-foreground"], 0.07),
          colors["--color-grouped-card"],
        )
    : flattenThemeColor(themeColorWithAlpha(accent, dark ? 0.1 : 0.07), colors["--color-screen"]);
  let selectedColor = colors["--color-secondary"];
  if (card && !dark) selectedColor = colors["--color-screen"];
  if (dark && (!card || themeId === "fab")) {
    selectedColor = flattenThemeColor(themeColorWithAlpha(accent, 0.32), colors["--color-screen"]);
  }
  const selectedTextColor =
    colors[!card && dark ? "--color-foreground" : "--color-secondary-foreground"];
  return {
    trackColor,
    selectedColor,
    selectedTextColor: themeColorWithContrast(selectedTextColor, selectedColor),
    mutedColor: themeColorWithContrast(
      colors["--color-foreground-muted"],
      trackColor,
      dark && !card ? 7 : 4.5,
    ),
  };
}
