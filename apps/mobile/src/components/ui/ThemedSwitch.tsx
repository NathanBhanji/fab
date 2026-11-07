import { Switch } from "react-native";

import type { ThemedSwitchProps } from "./NativeSwitch.types";

export type { ThemedSwitchProps } from "./NativeSwitch.types";

export function ThemedSwitch(props: ThemedSwitchProps) {
  return (
    <Switch
      {...props}
      ios_backgroundColorClassName="accent-switch-inactive-track"
      trackColorOffClassName="accent-switch-inactive-track"
      trackColorOnClassName="accent-switch-active-track"
    />
  );
}
