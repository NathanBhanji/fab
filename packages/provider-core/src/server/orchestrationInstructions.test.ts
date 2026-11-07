import { assert, describe, it } from "@effect/vitest";

import {
  FAB_DEVICE_TOOL_INSTRUCTIONS,
  FAB_DEVICE_TOOL_INSTRUCTIONS_WITH_TOOL_SEARCH,
  FAB_ORCHESTRATION_INSTRUCTIONS,
  fabAcpPromptWithInstructions,
  fabOrchestrationPrompt,
  fabOrchestrationSystemPrompt,
} from "./orchestrationInstructions.ts";

describe("Fab device instructions", () => {
  it("route device work through device_open and give Claude the line that loads the tools", () => {
    for (const intent of ["`device_list`", "`device_open`", "`agent-device`", "ssh", "`hostId`"]) {
      assert.include(FAB_DEVICE_TOOL_INSTRUCTIONS, intent);
    }
    assert.notInclude(FAB_DEVICE_TOOL_INSTRUCTIONS, "ToolSearch");
    const loadLine =
      " Load them with ToolSearch `select:mcp__fab__device_list,mcp__fab__device_open,mcp__fab__device_screenshot,mcp__fab__device_close`.";
    assert.include(FAB_DEVICE_TOOL_INSTRUCTIONS_WITH_TOOL_SEARCH, loadLine);
    assert.equal(
      FAB_DEVICE_TOOL_INSTRUCTIONS_WITH_TOOL_SEARCH.replace(loadLine, ""),
      FAB_DEVICE_TOOL_INSTRUCTIONS,
    );
  });

  it("open the app before the returned command's snapshots, screenshots and input", () => {
    assert.include(
      FAB_DEVICE_TOOL_INSTRUCTIONS,
      "its snapshots, screenshots and input need `open <app>` first,",
    );
  });

  it("keep the failure rule from taking over or closing a session another thread holds", () => {
    // agent-device's DEVICE_IN_USE advice is to rerun with the owner's --session or close it first.
    assert.include(
      FAB_DEVICE_TOOL_INSTRUCTIONS,
      "follow its advice once, but never reuse or close another session; if it still fails,",
    );
  });

  it("reach OpenCode and Cursor only when the session holds device access", () => {
    assert.include(fabOrchestrationSystemPrompt(true, true), FAB_DEVICE_TOOL_INSTRUCTIONS);
    assert.notInclude(fabOrchestrationSystemPrompt(true, false), "## Fab devices");
    assert.isUndefined(fabOrchestrationSystemPrompt(false, true));

    const firstRun = (hasDeviceTools: boolean) =>
      fabOrchestrationPrompt({
        prompt: "Check the login screen.",
        hasFabMcp: true,
        hasDeviceTools,
        orchestrationDelivered: false,
        deviceInstructionsDelivered: false,
      });
    assert.include(firstRun(true), FAB_DEVICE_TOOL_INSTRUCTIONS);
    assert.notInclude(firstRun(false), "## Fab devices");

    const laterRun = (deviceInstructionsDelivered: boolean) =>
      fabOrchestrationPrompt({
        prompt: "Check the login screen.",
        hasFabMcp: true,
        hasDeviceTools: true,
        orchestrationDelivered: true,
        deviceInstructionsDelivered,
      });
    assert.include(laterRun(false), FAB_DEVICE_TOOL_INSTRUCTIONS);
    assert.notInclude(laterRun(false), FAB_ORCHESTRATION_INSTRUCTIONS.trim());
    assert.equal(laterRun(true), "Check the login screen.");
  });

  it("reach ACP agents again when device access changes mid-thread", () => {
    const state = { interactionMode: "default", hasFabMcp: true, hasDeviceTools: false } as const;
    const withDevices = fabAcpPromptWithInstructions({
      prompt: "Check the login screen.",
      state: { ...state, hasDeviceTools: true },
      previousState: state,
    });
    assert.include(withDevices, FAB_DEVICE_TOOL_INSTRUCTIONS);
    assert.equal(
      fabAcpPromptWithInstructions({ prompt: "Again.", state, previousState: state }),
      "Again.",
    );
    assert.notInclude(fabAcpPromptWithInstructions({ prompt: "Hi.", state }), "## Fab devices");
  });
});
