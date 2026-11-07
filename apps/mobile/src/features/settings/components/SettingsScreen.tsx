import { useNavigation } from "@react-navigation/native";
import type { ReactNode } from "react";
import { View } from "react-native";

import type { AppBarProps } from "../../../components/ui/AppBar.types";
import { AppBar } from "../../../components/ui/AppBar";
import { ScreenContent as SettingsScreenContent } from "../../../components/ui/ScreenContent";
import { useWorkspaceSurface } from "../../workspace/useWorkspaceSurface";
import { useDeviceType } from "../../../native/native-layout-metrics";
import { useCompactWorkspaceTabs } from "../../workspace/useSystemWorkspaceTabBar";
import {
  ScreenScrollViewBottomInset,
  ScreenScrollViewSurface,
} from "../../../components/ui/ScreenScrollView";

export { SettingsScreenContent };

export function SettingsScreen(
  props: Pick<AppBarProps, "title" | "actions" | "search"> & {
    readonly children: ReactNode;
    readonly formSheet?: boolean;
    readonly workspaceRoot?: boolean;
  },
) {
  const navigation = useNavigation();
  const surface = useWorkspaceSurface();
  const deviceType = useDeviceType();
  const compactTabs = useCompactWorkspaceTabs();
  const cover = deviceType === "duo-folded";
  const workspaceRoot = props.workspaceRoot;

  // Settings' grouped cards only lift off the screen surface, so the folded Duo doesn't take
  // the workspace's drawer surface here.
  const surfaceClassName = cover ? "bg-screen" : workspaceRoot ? surface.className : "bg-sheet";

  return (
    <View collapsable={false} className={`flex-1 ${surfaceClassName}`}>
      <AppBar
        title={props.title}
        actions={props.actions}
        search={props.search}
        sidebar={false}
        onBack={workspaceRoot ? undefined : () => navigation.goBack()}
        hideBottomBorder={!props.formSheet}
      />
      <ScreenScrollViewBottomInset value={deviceType === "pad" || compactTabs ? 80 : 0}>
        <ScreenScrollViewSurface value={surfaceClassName}>
          {props.formSheet ? (
            props.children
          ) : (
            <SettingsScreenContent>{props.children}</SettingsScreenContent>
          )}
        </ScreenScrollViewSurface>
      </ScreenScrollViewBottomInset>
    </View>
  );
}
