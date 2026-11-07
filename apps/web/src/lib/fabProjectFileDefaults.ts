import { FAB_PROJECT_FILE_NAME, type EnvironmentId, type FabProjectFile } from "@fab/contracts";
import { parseFabProjectFile } from "@fab/shared/fabProjectFile";
import { executeAtomQuery } from "@fab/client-runtime/state/runtime";

import {
  getProjectFileQueryAtom,
  resolveProjectFileQueryData,
} from "~/components/files/projectFilesQueryState";
import { appAtomRegistry } from "~/rpc/atomRegistry";

export async function readFabProjectFile(
  environmentId: EnvironmentId,
  workspaceRoot: string,
): Promise<FabProjectFile | null> {
  const result = await executeAtomQuery(
    appAtomRegistry,
    getProjectFileQueryAtom(environmentId, workspaceRoot, FAB_PROJECT_FILE_NAME),
    { reportDefect: false, reportFailure: false },
  );
  const data = resolveProjectFileQueryData(
    environmentId,
    workspaceRoot,
    FAB_PROJECT_FILE_NAME,
    result._tag === "Success" ? result.value : null,
  );
  if (data === null || data.exists === false || data.truncated) return null;
  return parseFabProjectFile(data.contents);
}
