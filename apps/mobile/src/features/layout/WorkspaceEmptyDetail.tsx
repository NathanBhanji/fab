import { SymbolView } from "../../components/ui/AppSymbol";
import { Pressable, View } from "react-native";

import { AppText as Text } from "../../components/ui/AppText";
import type { WorkspaceTab } from "../workspace/workspace-tabs-state";

export function WorkspaceEmptyDetail(props: {
  readonly tab?: WorkspaceTab | "settings";
  readonly onStartNewTask?: () => void;
}) {
  const pullRequests = props.tab === "pullRequests";
  const settings = props.tab === "settings";
  if (props.tab === "usage") return <View className="flex-1 bg-screen" />;
  return (
    <View className="flex-1 items-center justify-center bg-screen px-10">
      <View className="max-w-[360px] items-center gap-3">
        <SymbolView
          name="sidebar.left"
          size={34}
          tintColorClassName="accent-icon-subtle"
          type="hierarchical"
        />
        <Text className="text-center text-xl font-fab-bold">
          {settings
            ? "Select a setting"
            : pullRequests
              ? "Select a pull request"
              : "Select a thread"}
        </Text>
        <Text className="text-center text-base text-foreground-muted">
          {settings
            ? "Choose a page from the sidebar."
            : pullRequests
              ? "Choose a pull request from the sidebar to review it."
              : "Choose a thread from the sidebar or start a new task."}
        </Text>
        {props.onStartNewTask && !pullRequests && !settings ? (
          <Pressable
            accessibilityRole="button"
            className="mt-2 flex-row items-center gap-2 rounded-full bg-primary px-5 py-3 active:opacity-70"
            onPress={props.onStartNewTask}
          >
            <Text className="text-base font-fab-bold text-primary-foreground">New thread</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
