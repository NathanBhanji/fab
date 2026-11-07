import * as AzureDevOpsDriver from "@fab/source-control-azure-devops/server/driver";
import * as BitbucketDriver from "@fab/source-control-bitbucket/server/driver";
import { builtInSourceControlDefinitions } from "@fab/source-control-definitions/registry";
import * as ForgejoDriver from "@fab/source-control-forgejo/server/driver";
import * as GitCafeDriver from "@fab/source-control-gitcafe/server/driver";
import * as GitHubDriver from "@fab/source-control-github/server/driver";
import * as GitLabDriver from "@fab/source-control-gitlab/server/driver";

/** In the shared registry's order, which is the order hosts are listed and probed in. */
export const BUILT_IN_SOURCE_CONTROL_DRIVER_LIST = [
  GitHubDriver.driver,
  GitLabDriver.driver,
  GitCafeDriver.driver,
  ForgejoDriver.driver,
  BitbucketDriver.driver,
  AzureDevOpsDriver.driver,
] as const;

export const sourceControlDefinitions = builtInSourceControlDefinitions;
