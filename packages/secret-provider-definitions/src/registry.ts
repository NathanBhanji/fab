import { makeSecretProviderDefinitionRegistry } from "@fab/secret-provider-core/shared/definition";
import * as OnePassword from "@fab/secret-provider-onepassword/shared/definition";

export const builtInSecretProviderDefinitions = makeSecretProviderDefinitionRegistry([
  OnePassword.definition,
]);
