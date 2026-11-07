import { sourceControlClients } from "@fab/client-runtime/source-control-clients";
import { Share } from "react-native";
import { copyTextWithHaptic } from "../../lib/copyTextWithHaptic";

interface PullRequestLink {
  readonly url: string;
  readonly title: string;
  readonly provider: string;
}

export function copyPullRequestLink(pr: PullRequestLink) {
  copyTextWithHaptic(pr.url, {
    target: `${sourceControlClients.get(pr.provider).changeRequest.singular} link`,
  });
}

export function sharePullRequestLink(pr: PullRequestLink) {
  // A `message` URL becomes plain text instead of a link preview.
  Share.share({ url: pr.url, title: pr.title }).catch((cause: unknown) =>
    console.error("Failed to share pull request link.", cause),
  );
}
