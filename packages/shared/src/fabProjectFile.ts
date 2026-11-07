import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";

import { FabProjectFile, FAB_PROJECT_FILE_SCHEMA_URL } from "@fab/contracts";

import { fromLenientJson } from "./schemaJson.ts";

export const FabProjectFileFromJson = fromLenientJson(FabProjectFile);

const decodeFabProjectFile = Schema.decodeExit(FabProjectFileFromJson);

export function parseFabProjectFile(contents: string): FabProjectFile | null {
  const decoded = decodeFabProjectFile(contents);
  return Exit.isSuccess(decoded) ? decoded.value : null;
}

export function buildFabProjectFileJsonSchema(): Record<string, unknown> {
  const document = Schema.toJsonSchemaDocument(FabProjectFile, { onExcessProperty: "error" });
  const jsonSchema: Record<string, unknown> = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: FAB_PROJECT_FILE_SCHEMA_URL,
    ...document.schema,
  };
  if (document.definitions && Object.keys(document.definitions).length > 0) {
    jsonSchema.$defs = document.definitions;
  }
  return jsonSchema;
}
