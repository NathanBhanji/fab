import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";

import { FabProjectFile } from "@fab/contracts";

import { fromLenientJson } from "./schemaJson.ts";

export const FabProjectFileFromJson = fromLenientJson(FabProjectFile);

const decodeFabProjectFile = Schema.decodeExit(FabProjectFileFromJson);

export function parseFabProjectFile(contents: string): FabProjectFile | null {
  const decoded = decodeFabProjectFile(contents);
  return Exit.isSuccess(decoded) ? decoded.value : null;
}
