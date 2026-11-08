# Release Checklist

> For maintainers. Using Fab? See [docs/user](../user/).

This document covers the unified release workflow for stable and nightly desktop releases.

Beta is the product label, not a release channel or version suffix. Release channels
remain stable and nightly. To ship 0.1.0 Beta, use `channel=stable` and
`version=0.1.0`. Removing the Beta label later is a branding change independent of
the version.

## What the workflow does

- Workflow: `.github/workflows/release.yml`
- Triggers:
  - manual `workflow_dispatch` with `channel=stable`, the normal way to ship stable. Stable
    and nightly dispatches must select `main`; preview may select any branch. The channel defaults
    to preview so an omitted selection cannot publish a stable release.
  - push tag matching `v*.*.*` for a stable release of an explicit commit
  - scheduled nightly check every 30 minutes
  - manual `workflow_dispatch` with `channel=nightly`
  - manual `workflow_dispatch` with `channel=preview`, the maintainers' test train. It exercises the whole release flow (build, sign, notarize, smoke, publish) for a commit that end users must never receive, which is how an unmerged branch or a risky change gets a real release run before it lands. It builds the triggering commit with nightly's versioning under the `preview` prerelease identifier (`0.0.41-preview.<date>.<run>`) and publishes a GitHub prerelease plus the npm packages under the `preview` dist-tag. Preview is not on the schedule, no default npm dist-tag points at it, its desktop builds carry no update feed, and no updater manifest (`latest*.yml`, `nightly*.yml`, blockmaps) is attached, so a stable or nightly install cannot be offered one. The only ways onto it are downloading the release by hand, `npx fab@preview`, `FAB_CHANNEL=preview` for the install scripts, or `fab update --channel preview` from a terminal; each prints a warning, and the CLI asks for confirmation when the running build is not itself a preview. The release itself is named as a maintainer test build and its body is a warning rather than generated notes: a changelog of unmerged branch history is not a changelog, and nightly and stable notes are unaffected because each series resolves its previous tag within its own channel. The hosted web app, AUR, and Discord announcements are skipped. Keep it; it costs nothing when idle.
- A manual stable release builds the commit of the latest published nightly, not `main` HEAD.
  Nightly is the release candidate: verify the nightly, then promote it. Merges to `main` keep
  landing while you verify and never leak into the stable build.
  - The version defaults to the one the nightly previewed (`0.0.39-nightly.*` ships as `0.0.39`).
    Pass the `version` input to override it, for example for a minor bump.
  - The stable tag is created on the nightly's commit when the GitHub Release is published.
  - Pushing a `vX.Y.Z` tag by hand still works and builds exactly the tagged commit. Use it when
    the commit to ship is not the latest nightly, such as a cherry-picked fix on a release branch.
- Runs lint, typecheck, and tests alongside artifact builds. Publishing waits for every check.
- Builds the platform-independent JS (server bundle, web client, Electron main) once in the `build_bundle` job and hands it to every platform job as the `js-bundle` artifact; the platform jobs only package it, so no runner rebuilds it.
- Builds four desktop artifacts in parallel for both channels, each as its own job (`desktop_<platform>_<arch>`, one call of `release-desktop.yml`), gated only on the bundle. Every target builds on hardware of its own architecture:
  - macOS `arm64` DMG
  - macOS `x64` DMG
  - Linux `x64` and `arm64` AppImage and `.deb`, from one electron-builder run. The `.deb` updates in the app through electron-updater, which installs it with `dpkg`.
- Opens the packaged Linux x64 AppImage (under Xvfb) and macOS arm64 DMG against a seeded database and opens a thread (`scripts/smoke-desktop-app.ts`). A build whose backend or bundle cannot start fails here, so nothing is published. The database in `scripts/fixtures/desktop-launch` is an old snapshot on purpose: the packaged server must migrate it forward, as it does for upgrading users. Do not regenerate it on schema changes.
- Publishes one GitHub Release with all produced files.
  - Stable tags with a suffix after `X.Y.Z` (for example `1.2.3-alpha.1`) are published as GitHub prereleases.
  - Only plain stable `X.Y.Z` releases are marked as the repository's latest release.
  - Nightly runs are always GitHub prereleases and never marked latest.
  - Automatically generated release notes are pinned to the previous tag in the same channel, so stable compares to the previous stable tag and nightly compares to the previous nightly tag.
  - The release job's **Write release notes** step (`scripts/generate-release-notes.ts`) builds the body: a computed header line, a short summary from `gpt-6.1-terra`, and GitHub's generated list folded under `<details>`. It needs the `OPENAI_API_KEY` secret. The desktop update popover shows up to seven highlights and the number of other fixes and performance improvements. Mobile-only commits count toward release totals but cannot be highlights. The offered release's age comes from the update feed's `releaseDate`. The nightly Discord post shows the part above `<details>`. If summary generation fails, the release uses GitHub's generated notes.
- Includes Electron auto-update metadata (for example `latest*.yml`, `nightly*.yml`, and `*.blockmap`) in release assets.
- Builds a self-contained CLI archive per platform (`fab-<version>-<platform>-<arch>.tar.gz`) in the same job as that target's desktop artifact and attaches them to the GitHub Release with a `SHA256SUMS` file, on every channel, for three targets: macOS arm64, Linux x64 and arm64. Every archive is built, signed, and smoke-tested on hardware of its own architecture. There is no macOS x64 archive: Node single-executables are unsupported on x64 macOS (the SEA docs list macOS as arm64 only) and the binary segfaults on start; the x64 desktop app is Electron and unaffected.
  - The archive holds the server as a Node single-executable (`scripts/build-cli-archive.ts`), so unpacking it needs neither Node, npm, nor a compiler. It is the only form in which Fab manages a runtime: the desktop's SSH environments, the boot service, `fab update`, and the install scripts all download and verify this archive against `SHA256SUMS`. The `fab` npm package exists for people who run `npx fab` or `npm install -g fab` themselves, and it downloads this same archive too; nothing in the product installs from npm. The `curl | sh` installer is `scripts/install.sh`.
  - The root `package.json` pins `engines.node` to the exact Node version used by development, CI and standalone executables. Keep it exact: cross-target builds download that version, and native executable builds reject a different host Node version. TEMPORARY: Linux arm64 executables build only on a Linux arm64 host and are injected with postject, because Node's `--build-sea` output cannot load on 16 or 64 KiB page kernels. Revert when [nodejs/node#67048](https://github.com/nodejs/node/issues/67048) is fixed. Runtime changes need a new Fab release version because installed runtimes are cached by that version.
  - macOS archives are signed with the Developer ID certificate and notarized when the Apple secrets are present (ad hoc otherwise, which still runs from `curl`/`tar` installs). Every native addon in the macOS archive is signed too, since the hardened runtime refuses unsigned libraries.
  - Each archive is extracted and executed (`scripts/smoke-cli-archive.ts`) on its build runner.
- After the GitHub Release is published, publishes the `fab` npm package with OIDC trusted publishing from the same workflow file. It is only a launcher (`scripts/npm-launcher/fab.mjs`): on first run it downloads its exact version's CLI archive from the GitHub Release, verifies it against `SHA256SUMS`, and unpacks it into `<Fab home>/runtime/versions/<version>`, the layout the install scripts and `fab update` share. The executables are not on npm. They used to be, as `@fab/fab-<platform>-<arch>` optional dependencies, but npm's publish-time scanning held those 80-250 MB packages back for up to an hour after the launcher was live, and every install in that window got a launcher with no executable. Those packages stay on npm at their old versions and get no new ones. Because the launcher reads from the release, `publish_cli` runs after `release`, never before.
  - stable releases publish npm dist-tag `latest`
  - nightly releases publish npm dist-tag `nightly`
  - preview releases publish npm dist-tag `preview`, which nothing resolves unless asked for by name
  - one-time setup: package `fab` needs a trusted publisher registered for this workflow file (see below).
- Builds the hosted web app on Vercel while the desktop jobs run, and makes it live only after a release is published:
  - stable releases are aliased to the `latest` hosted app channel
  - nightly releases are aliased to the `nightly` hosted app channel
- Signing is optional and auto-detected per platform from secrets.

## Required release credentials

Stable releases require these GitHub Actions secrets in addition to the platform and deployment
credentials documented below:

- `RELEASE_APP_ID`
- `RELEASE_APP_PRIVATE_KEY`

The finalize job uses them to commit and push aligned package versions to `main` as the Release App.
GitHub Release publication uses the repository-scoped workflow token so it has a rate-limit quota
independent from the shared Release App installation.

## Mobile TestFlight and store releases

Merges to main publish compatible OTAs and build iOS prereleases with the `testflight`
profile at version `3.0.0`. Build numbers increment automatically. The committed app
version remains the App Store release version.

To release iOS, dispatch **Mobile EAS Production** with `mode=build`,
`profile=production`, `platform=ios`, and the intended version, such as `2.0.1`.
The workflow commits and pushes the version before building and uploading it.
Select that build in App Store Connect for App Store review.

To force a TestFlight rebuild, select `profile=testflight`, `platform=ios`, and
leave the version blank. Submit the first `3.0.0` build for external beta review
in App Store Connect. Later builds may still require review; uploads alone do
not guarantee external approval. TestFlight builds expire after 90 days.

Both release and TestFlight binaries receive compatible production-channel OTAs,
separated by their major-version fingerprints. Manual `mode=update` uses the
selected profile's version. Before releasing `3.0.0` to the App Store, advance
`build.testflight.env.FAB_MOBILE_VERSION` in `apps/mobile/eas.json` to the next
unreleased major and get its first beta build approved.

## Hosted web app release deployment

The hosted app is intentionally not deployed by Vercel's Git integration. The
web project disables automatic Git deployments in `apps/web/vercel.ts` via
`git.deploymentEnabled: false`. `.github/workflows/release.yml` builds the web
app with Vercel CLI as a staged production deployment (`--skip-domain`) while
the desktop jobs run, and aliases the channel domains to it after the GitHub
Release succeeds.

Required GitHub Actions secrets:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

Optional GitHub Actions variables:

- `VERCEL_TEAM_SLUG`: overrides the Vercel CLI scope when the team slug is preferred over the `VERCEL_ORG_ID` secret.
- `FAB_WEB_ROUTER_URL`: defaults to `https://app.fab.invalid`.
- `FAB_WEB_LATEST_DOMAIN`: defaults to `latest.app.fab.invalid`.
- `FAB_WEB_NIGHTLY_DOMAIN`: defaults to `nightly.app.fab.invalid`.

Required Vercel domains:

- `app.fab.invalid`: the router domain users open, updated by stable releases.
- `latest.app.fab.invalid`: channel alias updated by stable releases.
- `nightly.app.fab.invalid`: channel alias updated by nightly releases.

The router domain uses `apps/web/vercel.ts` routes. Users opt into a channel by
visiting `/__fab/channel?channel=latest` or
`/__fab/channel?channel=nightly`; the router stores the
`fab_web_channel` cookie and rewrites future requests on `app.fab.invalid` to
the matching channel alias.

The release deploy job rewrites release package versions before upload so the
hosted app's About panel renders the release version. Stable deploys alias the
same deployment to both the `latest` channel and the router domain so the router
rules stay current. Nightly deploys only alias the `nightly` channel. The job
also passes `VITE_HOSTED_APP_CHANNEL=latest|nightly`, which renders the hosted
update track selector in the About panel. Changing the selector navigates
through `/__fab/channel` on the router domain so the user's channel cookie is
updated before redirecting to the hosted app root.

One-time Vercel dashboard setup:

1. Confirm the web project root directory remains `apps/web`.
2. Add the three domains above to the web project.
3. Disable automatic Git deployments in the dashboard if desired; the committed
   `vercel.ts` setting is the source-of-truth, but disconnecting Git in the
   dashboard is also safe.
4. Run one stable release deployment, or manually alias the current stable
   deployment, so `app.fab.invalid` points at a deployment containing the router
   rules in `apps/web/vercel.ts`. Future stable releases keep this alias current.

## Nightly builds

- Workflow: `.github/workflows/release.yml`
- Triggers:
  - scheduled check every 30 minutes
  - manual `workflow_dispatch` with `channel=nightly`
- Automatic nightlies require new commits and at least six hours since the last nightly was published, including manual nightlies.
- Manual nightlies bypass the time and change checks. Nightly runs remain serialized. Scheduled runs wait for an active nightly to finish, then check the publication gap before building.
- Runs the same desktop quality gates and artifact matrix as the tagged release flow.
- Publishes a GitHub prerelease only:
  - current tag format: `vX.Y.Z-nightly.YYYYMMDD.<run_number>`
  - `nightly-v...` is accepted only as a legacy previous-nightly tag
  - release name includes the short commit SHA
  - `make_latest` is always `false`
- Uses the next stable patch version as the nightly base. For example, `0.0.17` produces nightlies on `0.0.18-nightly.*`.
- Publishes Electron auto-update metadata to the dedicated `nightly` updater channel, so desktop users can opt into that track independently from stable.
- Publishes the `fab` npm launcher to the `nightly` npm dist-tag using the same nightly version.
- Does not commit version bumps back to `main`.

## Server self-update release invariant

Connected servers update to the client's exact version, not to an npm dist-tag. Servers that update
themselves download that version's CLI archive from the GitHub Release; servers run through npm are
handed a `fab@<version>` command to run. Every released client version must therefore have its
release archives, and then its npm launcher, available before users can receive that client.

The workflow enforces this ordering:

1. `release` publishes the GitHub Release with the CLI archives and `SHA256SUMS`. Every channel
   uploads to a draft and publishes only after all assets are attached, so a new version in the
   desktop update feed already has its archives. **Update everything** relies on this to update
   background-service hosts before npm has the version. Rerunning `release` after publication
   replaces assets in a public release, so service updates can fail until the upload finishes.
2. `publish_cli` publishes the `fab@<version>` launcher, which downloads from that release, on every
   channel.
3. `deploy_web` depends on both before moving the hosted channel to the new client.
   `build_web` builds that client earlier with `vercel deploy --prod --skip-domain`, which
   leaves the custom domains alone but moves the project's own `*.vercel.app` production
   hostname. That hostname is behind Vercel SSO, so users only get the client through the
   custom domains.

Desktop auto-update reads the GitHub Release directly, so a desktop client can see the new version
a few minutes before `fab@<version>` is on npm. Only the copied manual command for npm-run servers
depends on npm, and it works once `publish_cli` finishes.

Preserve these dependencies when changing the release graph. Publishing a client first would leave
the **Update server** action targeting a package version that does not exist yet.

For a release smoke test, confirm `npm view fab@<version> version` returns the expected version, then
connect the new client to a server on the previous version and verify that the update action
reconnects to the matching server. When the release adds database migrations, verify that the
remote update applies them and reconnects. A failed trial must restore the database snapshot and
restart the previous server. If the installed launcher does not support the target protocol,
verify that the update stops before restart and run `npx fab@<version> service update` once on the
server machine. Also test the manual or desktop-managed guidance when those environments are
available.

## Desktop auto-update notes

- Updater runtime: `apps/desktop/src/updates/DesktopUpdates.ts`.
- `electron-updater` adapter: `apps/desktop/src/electron/ElectronUpdater.ts`.
- `apps/desktop/src/main.ts` only wires the updater layers into the desktop runtime.
- Update UX:
  - Background checks run on startup delay + interval.
  - No automatic download or install.
  - The desktop UI shows a rocket update button when an update is available; click once to download, click again after download to restart/install.
- Provider: GitHub Releases (`provider: github`) configured at build time.
- Repository slug source:
  - `FAB_DESKTOP_UPDATE_REPOSITORY` (format `owner/repo`), if set.
  - otherwise `GITHUB_REPOSITORY` from GitHub Actions.
- Required release assets for updater:
  - platform installers (`.dmg`, `.AppImage`, `.deb`, plus macOS `.zip` for Squirrel.Mac update payloads)
  - channel metadata: `latest*.yml` for stable releases, `nightly*.yml` for nightly releases
  - `*.blockmap` files (used for differential downloads)
- macOS metadata note:
  - `electron-updater` reads `latest-mac.yml` on stable and `nightly-mac.yml` on nightly, for both Intel and Apple Silicon.
  - The workflow merges the per-arch mac manifests into one channel-specific mac manifest before publishing the GitHub Release.

## 0) npm OIDC trusted publishing setup (CLI)

After the GitHub Release is published, the workflow runs `node scripts/build-npm-launcher.ts`, then
`node apps/server/scripts/cli.ts publish --packages-dir npm-packages`, which runs `npm publish` on
`fab.tgz`. That is the only package published per release.

Checklist:

1. Confirm the npm org owns package `fab`.
2. For `fab`, configure a Trusted Publisher in the npm package settings:
   - Provider: GitHub Actions
   - Repository: this repo
   - Workflow file: `.github/workflows/release.yml`
   - Environment (if used): match your npm trusted publishing config
3. Ensure npm account and org policies allow trusted publishing for the package.
4. Create release tag `vX.Y.Z` and push; the workflow publishes the GitHub Release and then the
   launcher with npm dist-tag `latest`.
5. Nightly runs publish with npm dist-tag `nightly`; preview runs with `preview`.

## 1) Release validation and unsigned builds

There is no dry-run tag path. Pushing any accepted non-nightly tag, including
`v0.0.0-test.1`, classifies the run as the stable channel. It publishes `fab` with npm dist-tag
`latest`, creates a real GitHub Release, aliases the hosted app to `latest.app.fab.invalid` and
`app.fab.invalid`, and can commit a version bump to `main` in the finalize job. Do not push a test tag
to validate the workflow.

The workflow has no non-publishing `workflow_dispatch` mode. Use normal CI or local quality gates to
validate checks and builds without shipping. To exercise the complete release graph at lower stable
risk, manually dispatch `channel=nightly`; this still publishes a real nightly npm package, GitHub
prerelease, desktop updater release, and hosted nightly alias, but it does not update stable app aliases or
commit a version bump to `main`. Only run it when a real nightly release is acceptable.

Manual `channel=stable` is also a real stable-channel release. Omitting signing secrets only makes
platform artifacts unsigned; it does not prevent publication.

## 2) Apple signing + notarization setup (macOS)

Required secrets used by the workflow:

- `CSC_LINK`
- `CSC_KEY_PASSWORD`
- `APPLE_API_KEY`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`
- `MACOS_PROVISIONING_PROFILE` (base64-encoded provisioning profile)

Required repository variables:

- `APPLE_TEAM_ID`

Checklist:

1. Apple Developer account access:
   - Team has rights to create Developer ID certificates.
2. Create an explicit App ID for `dev.bhanji.fab`.
3. Create a `Developer ID Application` certificate and a compatible provisioning profile for that
   App ID.
4. Export the certificate + private key as `.p12` from Keychain.
5. Base64-encode the `.p12` and store as `CSC_LINK`.
6. Base64-encode the provisioning profile and store it as `MACOS_PROVISIONING_PROFILE`.
7. Store the `.p12` export password as `CSC_KEY_PASSWORD`, and set `APPLE_TEAM_ID` to the
   10-character Apple Developer Team ID.
8. In App Store Connect, create an API key (Team key).
9. Add API key values:
   - `APPLE_API_KEY`: contents of the downloaded `.p8`
   - `APPLE_API_KEY_ID`: Key ID
   - `APPLE_API_ISSUER`: Issuer ID
10. Re-run a tag release and confirm macOS artifacts are signed and notarized.

Notes:

- `APPLE_API_KEY` is stored as raw key text in secrets.
- The workflow writes it to a temporary `AuthKey_<id>.p8` file at runtime.
- The workflow decodes `MACOS_PROVISIONING_PROFILE`, validates it with `security cms`, and passes it
  to the desktop packager.
- In-app browser passkeys depend on this profile. The packager adds each entitlement only when
  the profile grants it, because macOS will not launch an app that claims more than its profile
  allows. The build log reports which ones it enabled.
  - `keychain-access-groups` (`<TEAM_ID>.dev.bhanji.fab.webauthn`) enables Touch ID passkeys.
    Profiles that grant the team's keychain groups (`<TEAM_ID>.*`) cover it.
  - `com.apple.developer.web-browser.public-key-credential` lets the system passkey sheet (iCloud
    Keychain, password managers, phones, security keys) serve any site. Apple grants it as a
    managed capability: the Account Holder requests it through the
    [macOS Browsers Passkeys form](https://developer.apple.com/contact/request/macos-browsers-passkeys/).
    After approval, regenerate the profile and update `MACOS_PROVISIONING_PROFILE`.

## 3) Ongoing release checklist

1. Pick the latest nightly and verify it: run the smoke test above against its artifacts and
   check the nightly channel for regressions.
2. Dispatch the Release workflow with `channel=stable`. Leave `version` empty unless the version
   should differ from the one the nightly previewed.
3. Confirm the `Resolve release commit` notice names the nightly tag and commit you verified. If a
   newer nightly published in between, the run builds that one instead.
4. Verify workflow steps:
   - preflight passes
   - release quality checks pass
   - `build_bundle` and all platform builds pass
   - `publish_cli` publishes the exact release version before the release job
   - release job uploads expected files
5. Smoke test downloaded artifacts.

## 4) Troubleshooting

- macOS build unsigned when expected signed:
  - Check all Apple secrets plus `APPLE_TEAM_ID` are populated and non-empty.
  - Confirm the provisioning profile belongs to `APPLE_TEAM_ID.dev.bhanji.fab`.
- Build fails with signing error:
  - Retry with secrets removed to confirm unsigned path still works.
  - Re-check the certificate, provisioning profile, and App Store Connect API key values.
