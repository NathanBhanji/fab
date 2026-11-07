import { sanitizeFeatureBranchName } from "@fab/shared/git";
import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { useState } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SheetHeader } from "../../../components/ui/SheetHeader";
import { ScreenContent } from "../../../components/ui/ScreenContent";
import { AppText as Text, AppTextInput as TextInput } from "../../../components/ui/AppText";
import { cn } from "../../../lib/cn";
import { useEnvironmentQuery } from "../../../state/query";
import { useThreadSelection } from "../../../state/use-thread-selection";
import { useSelectedThreadGitActions } from "../../../state/use-selected-thread-git-actions";
import { useSelectedThreadGitState } from "../../../state/use-selected-thread-git-state";
import { useSelectedThreadWorktree } from "../../../state/use-selected-thread-worktree";
import { vcsEnvironment } from "../../../state/vcs";
import { SheetActionButton } from "./gitSheetComponents";

type GitBranchesSheetProps = StaticScreenProps<{
  readonly environmentId: string;
  readonly threadId: string;
}>;

export function GitBranchesSheet(_props: GitBranchesSheetProps) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { selectedThread } = useThreadSelection();
  const { selectedThreadCwd } = useSelectedThreadWorktree();
  const gitState = useSelectedThreadGitState();
  const gitActions = useSelectedThreadGitActions();
  const { canChangeThreadBranch } = gitActions;

  const gitStatus = useEnvironmentQuery(
    selectedThread !== null && selectedThreadCwd !== null
      ? vcsEnvironment.status({
          environmentId: selectedThread.environmentId,
          input: { cwd: selectedThreadCwd },
        })
      : null,
  );

  const currentBranchLabel = gitStatus.data?.refName ?? selectedThread?.branch ?? "Detached HEAD";
  const currentWorktreePath = selectedThreadCwd;
  const availableBranches = gitState.selectedThreadBranches;
  const branchesLoading = gitState.selectedThreadBranchesLoading;
  const busy = gitState.gitOperationLabel !== null;

  const [newBranchName, setNewBranchName] = useState("");
  const [worktreeBaseBranchOverride, setWorktreeBaseBranchOverride] = useState<string | null>(null);
  const worktreeBaseBranch =
    worktreeBaseBranchOverride ??
    (currentBranchLabel === "Detached HEAD" ? "main" : currentBranchLabel);
  const [worktreeBranchName, setWorktreeBranchName] = useState("");

  const disabledExistingBranchNames: Array<string> = [];
  for (const branch of availableBranches) {
    if (branch.worktreePath !== null && branch.worktreePath !== currentWorktreePath) {
      disabledExistingBranchNames.push(branch.name);
    }
  }
  const disabledExistingBranches = new Set(disabledExistingBranchNames);

  return (
    <View collapsable={false} className="bg-sheet ios:flex-1">
      <SheetHeader
        presentation="native"
        title="Branches & worktrees"
        onClose={() => navigation.goBack()}
      />
      <ScreenContent fitToContents>
        <ScrollView
          nestedScrollEnabled
          className="ios:flex-1"
          contentInsetAdjustmentBehavior={Platform.OS === "ios" ? "automatic" : "never"}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentInset={{ bottom: Math.max(insets.bottom, 18) + 18 }}
          contentContainerClassName="ios:gap-4 ios:px-5 ios:pt-2"
        >
          <View className="bg-card ios:gap-2 ios:rounded-[18px] ios:border ios:border-border ios:px-4 ios:py-4">
            <Text className="ios:text-foreground-secondary ios:text-2xs ios:font-fab-bold ios:tracking-[1px] ios:uppercase">
              New branch
            </Text>
            <TextInput
              value={newBranchName}
              onChangeText={setNewBranchName}
              placeholder="feature/mobile-polish"
              accessibilityLabel="New branch name"
              className="ios:rounded-[18px]"
            />
            <SheetActionButton
              icon="plus"
              label="Create & checkout"
              tone="primary"
              disabled={!canChangeThreadBranch || busy || newBranchName.trim().length === 0}
              onPress={() => {
                const branch = sanitizeFeatureBranchName(newBranchName.trim());
                if (branch.length === 0) return;
                void gitActions.onCreateSelectedThreadBranch(branch).then((result) => {
                  if (result === null) return;
                  setNewBranchName("");
                  navigation.goBack();
                });
              }}
            />
          </View>

          <View className="bg-card ios:gap-2 ios:rounded-[18px] ios:border ios:border-border ios:px-4 ios:py-4">
            <Text className="ios:text-foreground-secondary ios:text-2xs ios:font-fab-bold ios:tracking-[1px] ios:uppercase">
              New worktree
            </Text>
            <TextInput
              value={worktreeBaseBranch}
              onChangeText={setWorktreeBaseBranchOverride}
              placeholder="main"
              accessibilityLabel="Worktree base branch"
              className="ios:rounded-[18px]"
            />
            <TextInput
              value={worktreeBranchName}
              onChangeText={setWorktreeBranchName}
              placeholder="feature/mobile-thread"
              accessibilityLabel="Worktree branch name"
              className="ios:rounded-[18px]"
            />
            <SheetActionButton
              icon="square.split.2x1"
              label="Create worktree"
              tone="primary"
              disabled={
                !canChangeThreadBranch ||
                busy ||
                worktreeBaseBranch.trim().length === 0 ||
                worktreeBranchName.trim().length === 0
              }
              onPress={() => {
                const baseBranch = worktreeBaseBranch.trim();
                const newBranch = worktreeBranchName.trim();
                if (baseBranch.length === 0 || newBranch.length === 0) return;
                void gitActions
                  .onCreateSelectedThreadWorktree({ baseBranch, newBranch })
                  .then((result) => {
                    if (result === null) return;
                    setWorktreeBranchName("");
                    navigation.goBack();
                  });
              }}
            />
          </View>

          <View className="gap-2">
            <Text className="text-foreground-secondary ios:text-2xs ios:font-fab-bold ios:tracking-[1px] ios:uppercase">
              Existing branches
            </Text>
            {branchesLoading ? (
              <Text className="text-foreground-secondary text-sm font-medium">
                Loading branches...
              </Text>
            ) : null}
            {!branchesLoading && availableBranches.length === 0 ? (
              <Text className="text-foreground-secondary text-sm font-medium">
                No local branches found.
              </Text>
            ) : null}
            {availableBranches.map((branch) => {
              const disabled = disabledExistingBranches.has(branch.name);
              const subtitle = branch.worktreePath
                ? branch.worktreePath === currentWorktreePath
                  ? "Checked out in this thread"
                  : "Checked out in another worktree"
                : branch.isDefault
                  ? "Default branch"
                  : "Local branch";

              return (
                <Pressable
                  key={branch.name}
                  className={cn(
                    "gap-1 px-4 py-3 disabled:opacity-[0.45] ios:rounded-[18px] ios:border",
                    branch.current ? "ios:border-subtle-strong" : "ios:border-border",
                  )}
                  accessibilityRole="button"
                  accessibilityState={{ selected: branch.current, disabled: busy || disabled }}
                  disabled={!canChangeThreadBranch || busy || disabled}
                  onPress={() => {
                    void gitActions.onCheckoutSelectedThreadBranch(branch.name).then((result) => {
                      if (result === null) return;
                      navigation.goBack();
                    });
                  }}
                >
                  <View className="absolute inset-0 rounded-[18px] bg-card" />
                  <Text className="text-foreground text-base ios:font-fab-bold">{branch.name}</Text>
                  <Text className="text-foreground-secondary text-xs font-medium">{subtitle}</Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </ScreenContent>
    </View>
  );
}
