# Building the mobile Screens dependency

The mobile v5 stack uses a committed tarball from the
[Fab Screens fork](https://github.com/pingdotgg/react-native-screens/tree/fab-v5.0.0-t3.45).
The fork owns the integration changes; the app does not patch this package.
Each archive includes compiled JavaScript, declarations, native source and
`fab-fork.json` recording its version, source commit and upstream base.

To reproduce an archive, use Node 24 and the repository's pinned Yarn from a
clean fork checkout at the source commit recorded in its `fab-fork.json`:

```sh
yarn --cwd /tmp/fab-screens-fork pack:fab /absolute/path/to/fab/apps/mobile/deps
```

For an update, sync the fork's `main` with upstream, merge it and the required
proposal branches into `fab/main`, increment the `5.0.0-fab.N` version, pin `fabFork.upstreamCommit` to the
integrated upstream SHA and commit.
Run `pack:fab` from that clean checkout and tag the source as `fab-v<version>`.
Publish the source commit and tag to the fork before submitting the app change.
Replace the old archive, update `apps/mobile/package.json` and run `vp i` to
regenerate the lockfile. Verify mobile types and affected navigation tests.
Changes to native source also require rebuilding and testing the native client.

The same iOS binary supports iPhone, iPad, and Duo. UIKit hinge updates enable
phone workspace columns at runtime; regular phones retain portrait rotation.
Use the normal EAS build profiles and update channels. Duo support requires a
binary built with the iOS 27.1 SDK; an OTA cannot add the native APIs.
