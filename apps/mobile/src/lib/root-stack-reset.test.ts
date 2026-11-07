import * as NodeModule from "node:module";
import { describe, expect, it } from "vite-plus/test";
import {
  resetRootStack,
  type RootStackNavigation,
  type RootStackResetAction,
} from "./root-stack-reset";

const require = NodeModule.createRequire(import.meta.url);
const nativePackage = require.resolve("@react-navigation/native/package.json");
const requireFromNative = NodeModule.createRequire(nativePackage);
const corePackage = requireFromNative.resolve("@react-navigation/core/package.json");
const requireFromCore = NodeModule.createRequire(corePackage);
const { StackActions, StackRouter } = requireFromCore("@react-navigation/routers") as {
  readonly StackActions: typeof import("@react-navigation/native").StackActions;
  readonly StackRouter: typeof import("@react-navigation/native").StackRouter;
};
const router = StackRouter({});
const options = {
  routeNames: [
    "Home",
    "Thread",
    "ThreadFiles",
    "ThreadTerminal",
    "GitOverview",
    "PullRequest",
    "PullRequestFile",
    "PullRequestReviewers",
    "Settings",
    "SettingsEnvironments",
    "SettingsAppearance",
    "SettingsOpenSourceLicenses",
    "SettingsUsage",
    "SettingsUsageAccount",
  ],
  routeParamList: {},
  routeGetIdList: {},
};
const thread = {
  name: "Thread",
  params: { environmentId: "environment-a", threadId: "thread-a" },
} as const;

function apply(
  state: ReturnType<typeof router.getInitialState>,
  action: Parameters<typeof router.getStateForAction>[1],
) {
  const result = router.getStateForAction(state, action, options);
  if (!result) throw new Error(`Router rejected ${action.type}`);
  return router.getRehydratedState(result, options);
}

function resetToHome(navigation: RootStackNavigation) {
  resetRootStack(navigation, (state) => ({
    ...state,
    index: 0,
    routes: [state.routes.find((route) => route.name === "Home") ?? { name: "Home" }],
  }));
}

function names(state: ReturnType<typeof router.getInitialState>) {
  return state.routes.map((route) => route.name);
}

describe("resetRootStack", () => {
  it("resets the root stack when a nested stack has focus", () => {
    const root = apply(router.getInitialState(options), StackActions.push("Thread", thread.params));
    const nested = router.getInitialState({ ...options, routeNames: ["Nested", "NestedChild"] });
    const actions: RootStackResetAction[] = [];
    const rootNavigation = {
      dispatch: () => undefined,
      getParent: () => undefined,
      getState: () => root,
    };
    resetToHome({
      dispatch: (action) => actions.push(action),
      getParent: () => rootNavigation,
      getState: () => nested,
    });
    const [action] = actions;
    expect(action?.target).toBe(root.key);
    expect(names(apply(root, action!))).toEqual(["Home"]);
  });

  it("resets from the navigation container before any navigation action", () => {
    const root = router.getInitialState(options);
    const actions: RootStackResetAction[] = [];
    // The container only learns the root state after the first action.
    resetToHome({
      dispatch: (action) => actions.push(action),
      getParent: () => undefined,
      getState: () => undefined,
      getRootState: () => root,
    });
    const [action] = actions;
    expect(action?.target).toBe(root.key);
    expect(names(apply(root, action!))).toEqual(["Home"]);
  });
});
