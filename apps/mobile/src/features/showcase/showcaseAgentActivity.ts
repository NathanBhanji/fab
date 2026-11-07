import type { EnvironmentProject, EnvironmentThreadShell } from "@fab/client-runtime/state/shell";

import type {
  AgentActivityPhase,
  AgentActivityProps,
  AgentActivityRowProps,
} from "../../widgets/AgentActivity";

const SHOWCASE_AGENT_ACTIVITY_ROWS = [
  { threadId: "pocket-command-center", phase: "waiting_for_approval", minutesAgo: 1 },
  { threadId: "beautiful-boot", phase: "waiting_for_input", minutesAgo: 4 },
  { threadId: "buttery-suspense", phase: "running", minutesAgo: 2 },
  { threadId: "remote-command-center", phase: "completed", minutesAgo: 3 },
] as const satisfies ReadonlyArray<{
  readonly threadId: string;
  readonly phase: AgentActivityPhase;
  readonly minutesAgo: number;
}>;

const STATUS_BY_PHASE: Record<AgentActivityPhase, string> = {
  starting: "Connecting",
  running: "Working",
  waiting_for_approval: "Approval",
  waiting_for_input: "Input",
  stale: "Waiting",
  completed: "Done",
  failed: "Failed",
};

const ACTIVE_PHASES: ReadonlySet<AgentActivityPhase> = new Set([
  "starting",
  "running",
  "waiting_for_approval",
  "waiting_for_input",
]);

/** Returns null until every staged thread and its project have loaded. */
export function buildShowcaseAgentActivity(
  threads: ReadonlyArray<EnvironmentThreadShell>,
  projects: ReadonlyArray<EnvironmentProject>,
  now: number,
): AgentActivityProps | null {
  const rows: AgentActivityRowProps[] = [];
  for (const definition of SHOWCASE_AGENT_ACTIVITY_ROWS) {
    const thread = threads.find((candidate) => String(candidate.id) === definition.threadId);
    const project = thread
      ? projects.find(
          (candidate) =>
            candidate.environmentId === thread.environmentId && candidate.id === thread.projectId,
        )
      : undefined;
    if (!thread || !project) return null;
    const environmentId = String(thread.environmentId);
    rows.push({
      environmentId,
      threadId: definition.threadId,
      projectTitle: project.title,
      threadTitle: thread.title,
      modelTitle: "",
      phase: definition.phase,
      status: STATUS_BY_PHASE[definition.phase],
      updatedAt: new Date(now - definition.minutesAgo * 60_000).toISOString(),
      deepLink: `/threads/${encodeURIComponent(environmentId)}/${encodeURIComponent(definition.threadId)}`,
    });
  }
  return {
    title: "Fab",
    subtitle: "Agent work in progress",
    activeCount: rows.filter((row) => ACTIVE_PHASES.has(row.phase)).length,
    updatedAt: new Date(now).toISOString(),
    activities: rows,
  };
}
