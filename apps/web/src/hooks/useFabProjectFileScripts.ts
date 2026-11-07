import {
  FAB_PROJECT_FILE_NAME,
  type EnvironmentId,
  type FabProjectFile,
  type FabProjectFileScript,
} from "@fab/contracts";
import { parseFabProjectFile } from "@fab/shared/fabProjectFile";

import { useProjectFileQuery } from "~/components/files/projectFilesQueryState";

const NO_SCRIPTS: ReadonlyArray<FabProjectFileScript> = [];

export interface FabProjectFileState {
  status: "loading" | "missing" | "invalid" | "valid";
  file: FabProjectFile | null;
  scripts: ReadonlyArray<FabProjectFileScript>;
}

export function useFabProjectFileState(
  environmentId: EnvironmentId,
  cwd: string | null,
): FabProjectFileState {
  const query = useProjectFileQuery(environmentId, cwd ?? "", FAB_PROJECT_FILE_NAME, cwd !== null);
  const contents = query.data && !query.data.truncated ? query.data.contents : null;
  const isPending = query.isPending;
  if (contents === null) {
    return {
      status: isPending ? "loading" : "missing",
      file: null,
      scripts: NO_SCRIPTS,
    } as const;
  }
  const file = parseFabProjectFile(contents);
  if (file === null) {
    return { status: "invalid", file: null, scripts: NO_SCRIPTS } as const;
  }
  return { status: "valid", file, scripts: file.scripts ?? NO_SCRIPTS } as const;
}

export function useFabProjectFileScripts(
  environmentId: EnvironmentId,
  cwd: string | null,
): ReadonlyArray<FabProjectFileScript> {
  return useFabProjectFileState(environmentId, cwd).scripts;
}
