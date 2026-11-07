import { describe, expect, it } from "vite-plus/test";

import {
  FAB_MCP_TOOL_NAMES,
  resolveFabMcpSummaryAction,
  resolveFabMcpToolDefinition,
  resolveFabMcpToolPresentation,
} from "./fabMcpToolPresentation.ts";

describe("resolveFabMcpToolPresentation", () => {
  it("recognizes every Fab tool across provider prefixes and completion suffixes", () => {
    for (const tool of FAB_MCP_TOOL_NAMES) {
      const presentation = resolveFabMcpToolPresentation(tool);
      for (const prefix of [
        "mcp__fab__",
        "Fab.",
        "fab.",
        "fab-direct.",
        "mcp__fab_direct__",
        "fab/",
        "fab:",
        "mcp_fab_",
        "Fab ",
        "fab · ",
      ]) {
        expect(resolveFabMcpToolPresentation(`${prefix}${tool} completed`), tool).toEqual(
          presentation,
        );
      }
      expect(resolveFabMcpToolPresentation(`mcp__another-server__${tool}`), tool).toBeNull();
    }
  });

  it("matches OpenCode 2's per-thread server names, whose thread ids hold underscores", () => {
    expect(
      resolveFabMcpToolPresentation("fab-thread_opencode2-adapter_delegate_task")?.displayName,
    ).toBe("Delegate a child task");
    expect(resolveFabMcpToolPresentation("fab-thread_opencode2-adapter_not_a_tool")).toBeNull();
  });
});

describe("resolveFabMcpToolDefinition", () => {
  it("labels an action tool call as the action it ran", () => {
    expect(
      resolveFabMcpToolDefinition("mcp__fab__preview_act", { action: "type" })?.labels,
    ).toEqual(resolveFabMcpToolDefinition("preview_type")?.labels);
    expect(resolveFabMcpToolDefinition("fab_thread_transfer", { action: "fork" })?.displayName).toBe(
      resolveFabMcpToolDefinition("fab_thread_fork")?.displayName,
    );
    expect(resolveFabMcpToolDefinition("preview_act", { action: "unknown" })?.labels[2]).toBe(
      "Used",
    );
  });
});

describe("resolveFabMcpSummaryAction", () => {
  it("summarizes an action tool by the action each call ran", () => {
    expect(resolveFabMcpSummaryAction("mcp__fab__fab_queue", { action: "list" })).toBe(
      "queue-list",
    );
    expect(resolveFabMcpSummaryAction("fab_queue", { action: "edit" })).toBe("queue-edit");
    expect(resolveFabMcpSummaryAction("fab_thread_transfer", { action: "status" })).toBe(
      "thread-transfers",
    );
    expect(resolveFabMcpSummaryAction("fab_thread_configure", {})).toBe("thread-configuration");
    expect(resolveFabMcpSummaryAction("schedule_task", { scheduledTaskId: "task-1" })).toBe(
      "schedule-update",
    );
    expect(resolveFabMcpSummaryAction("delegate_task", { task: "x" })).toBe("delegate");
  });
});
