import { resolveDefaultBranchActionDialogCopy } from "@fab/client-runtime/state/vcs";
import { sourceControlClients } from "@fab/client-runtime/source-control-clients";
import { resolveAutoFeatureBranchName } from "@fab/shared/git";
import * as Arr from "effect/Array";
import * as Result from "effect/Result";
import { StackActions, useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { useCallback, useMemo } from "react";
import { ScrollView, View } from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenContent } from "../../../components/ui/ScreenContent";
import { AppText as Text } from "../../../components/ui/AppText";
import { useSelectedThreadGitActions } from "../../../state/use-selected-thread-git-actions";
import { useSelectedThreadGitState } from "../../../state/use-selected-thread-git-state";
import { useThreadSelection } from "../../../state/use-thread-selection";
import { SheetActionButton } from "./gitSheetComponents";

type GitConfirmSheetProps = StaticScreenProps<{
  readonly environmentId: string;
  readonly threadId: string;
  readonly confirmAction?: string;
  readonly branchName?: string;
  readonly includesCommit?: string;
  readonly commitMessage?: string;
  readonly filePaths?: string;
}>;

export function GitConfirmSheet(props: GitConfirmSheetProps) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const gitState = useSelectedThreadGitState();
  const gitActions = useSelectedThreadGitActions();
  const { canWriteSourceControl, canChangeThreadBranch } = gitActions;
  const { selectedThreadProject } = useThreadSelection();
  const terminology = sourceControlClients.get(
    selectedThreadProject?.repositoryIdentity?.provider,
  ).changeRequest;

  const params = props.route.params;

  const confirmAction = params.confirmAction as
    | "push"
    | "create_pr"
    | "commit_push"
    | "commit_push_pr"
    | undefined;
  const branchName = params.branchName ?? "";
  const includesCommit = params.includesCommit === "true";
  const environmentId = params.environmentId ?? "";
  const threadId = params.threadId ?? "";

  const copy = useMemo(
    () =>
      confirmAction
        ? resolveDefaultBranchActionDialogCopy({
            action: confirmAction,
            branchName,
            includesCommit,
            terminology,
          })
        : null,
    [branchName, confirmAction, includesCommit, terminology],
  );

  const continuePendingAction = async () => {
    if (!canWriteSourceControl || !confirmAction) return;
    navigation.dispatch(StackActions.replace("Thread", { environmentId, threadId }));
    await gitActions.onRunSelectedThreadGitAction({
      action: confirmAction,
      ...(params.commitMessage ? { commitMessage: params.commitMessage } : {}),
      ...(params.filePaths ? { filePaths: params.filePaths.split(",") } : {}),
    });
  };

  const movePendingActionToFeatureBranch = useCallback(async () => {
    if (!canChangeThreadBranch || !confirmAction) return;
    navigation.dispatch(StackActions.replace("Thread", { environmentId, threadId }));

    if (includesCommit) {
      await gitActions.onRunSelectedThreadGitAction({
        action: confirmAction,
        featureBranch: true,
        ...(params.commitMessage ? { commitMessage: params.commitMessage } : {}),
        ...(params.filePaths ? { filePaths: params.filePaths.split(",") } : {}),
      });
      return;
    }

    const branches =
      gitState.selectedThreadBranches.length > 0
        ? gitState.selectedThreadBranches
        : await gitActions.refreshSelectedThreadBranches();
    if (branches === null) return;
    const newBranchName = resolveAutoFeatureBranchName(
      Arr.filterMap(branches, (branch) =>
        branch.isRemote ? Result.failVoid : Result.succeed(branch.name),
      ),
    );
    const created = await gitActions.onCreateSelectedThreadBranch(newBranchName);
    if (created === null) return;
    await gitActions.onRunSelectedThreadGitAction({ action: confirmAction });
  }, [
    canChangeThreadBranch,
    confirmAction,
    gitActions,
    gitState.selectedThreadBranches,
    includesCommit,
    params,
    navigation,
    environmentId,
    threadId,
  ]);

  return (
    <View collapsable={false} className="bg-sheet ios:flex-1">
      <View className="min-h-4 pt-2" />

      <ScreenContent fitToContents>
        <ScrollView nestedScrollEnabled className="ios:flex-1" showsVerticalScrollIndicator={false}>
          <View className="ios:items-center ios:gap-1 ios:px-5 ios:pb-3 ios:pt-4">
            <Text className="text-xs font-fab-bold tracking-[1px] uppercase text-foreground-muted">
              Confirm
            </Text>
            <Text className="ios:text-center ios:text-3xl ios:font-fab-bold">
              {copy?.title ?? "Run action on default branch?"}
            </Text>
            <Text className="text-foreground-secondary leading-normal ios:text-center ios:text-sm ios:font-medium">
              {copy?.description ?? "Choose how to continue."}
            </Text>
          </View>

          <View
            className="ios:gap-3 ios:px-5 ios:pt-2"
            style={{ paddingBottom: Math.max(insets.bottom, 18) + 8 }}
          >
            <SheetActionButton
              icon="arrow.right.circle"
              label={copy?.continueLabel ?? "Continue"}
              disabled={!canWriteSourceControl}
              onPress={() => void continuePendingAction()}
            />
            <SheetActionButton
              icon="arrow.branch"
              label="Feature branch & continue"
              disabled={!canChangeThreadBranch}
              tone="primary"
              onPress={() => void movePendingActionToFeatureBranch()}
            />
          </View>
        </ScrollView>
      </ScreenContent>
    </View>
  );
}
