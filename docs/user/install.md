# Install Fab

Fab runs coding agents on your computer and lets you control them from its
desktop, web, or mobile app. Set up the machine where the agents will work first.

Fab has no published releases. Build it from a clone of the repository with
[`vp`](https://viteplus.dev/guide/), which provides the Node version it needs:

```bash
curl -fsSL https://vite.plus | bash
git clone https://github.com/nathanbhanji/fab
cd fab && vp i
```

## Requirements

You need an installed, authenticated provider before starting a thread. You can
launch Fab and configure providers afterwards.

## Command line

Build the server and run it from the clone:

```bash
vp run build:desktop
node apps/server/dist/bin.mjs
```

To get a `fab` command on your `PATH`, install it from the desktop app (see
[The `fab` command](#the-fab-command)).

| Task                                             | Command                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------ |
| Start the server and open the web app            | `fab`                                                                    |
| Start the server without a browser               | `fab serve`                                                              |
| Use it from your other devices                   | `fab up` ([details](./remote-access.md))                                 |
| Keep it running in the background (macOS, Linux) | `fab service install` ([details](./background-service.md))               |
| Reclaim database space                           | `fab doctor` ([details](./background-service.md#reclaim-database-space)) |
| Remove it again                                  | `fab uninstall`                                                          |

Run `fab help` or `fab --help` for the full reference. To start in a new working
directory, use an explicit path such as `fab ./my-project`. A bare directory name
is accepted only if it already exists.

If `fab` or `fab start` reports an already running server, connect to that server
instead. Stop it before starting a replacement, or use a different `--base-dir`
for an independent server.

To update a server run from the clone, `git pull` and rebuild.

## Desktop app

Build an unsigned app for this machine. It is written to `release/`:

```bash
vp run dist:desktop:dmg     # macOS
vp run dist:desktop:linux   # Linux AppImage
```

The [development runbook](../operations/development.md#desktop-artifacts) lists the
build prerequisites and signing options.

### The `fab` command

The desktop app includes the `fab` command-line tool. To run it from any
terminal, open **Settings → About** and choose **Install** next to
**fab command**. It adds a `fab` link to a folder on your `PATH`. Open a new
terminal afterwards. **Remove** takes it off again.

### Open a project from a terminal

With the desktop app already running on the same machine:

```bash
fab app
```

This opens a new thread for the current directory, adding the project if needed.
Pass a path, such as `fab app ../my-project`, to open another directory. It requires
the desktop app, so a standalone server or an SSH session is not enough. If the
command cannot reach the app, start or update the desktop app and try again.

## Mobile app

Install the iPhone development client on a booted simulator:

```bash
vp run mobile:install ios
```

The [mobile README](../../apps/mobile/README.md) covers physical devices, Metro, and
native builds. The phone connects to a server on another machine. Follow
[remote access](./remote-access.md) to pair it over Tailscale or your local network.

## Providers

Open **Settings → Providers** in the web or desktop app, select the environment,
and enable the provider you want. Installation, login, and configuration belong
to that environment's machine, even when you connect from a phone or another
computer.

| Provider    | Install and authenticate                                                                                                                                  |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codex       | [Connect with ChatGPT](./providers-codex.md#connect-with-chatgpt), or install [Codex CLI](https://developers.openai.com/codex/cli) and run `codex login`. |
| Claude      | Install [Claude Code](https://claude.com/product/claude-code), then run `claude auth login`.                                                              |
| Cursor      | Install [Cursor CLI](https://cursor.com/cli), then run `agent login`.                                                                                     |
| Grok Build  | Install [Grok Build CLI](https://x.ai/cli), then run `grok login`.                                                                                        |
| Kiro        | Install [Kiro CLI](https://kiro.dev/docs/cli/), then run `kiro-cli login`.                                                                                |
| OpenCode    | Install [OpenCode](https://opencode.ai), then run `opencode auth login`.                                                                                  |
| Antigravity | Install and sign in with Google from Fab's provider settings.                                                                                             |
| Pi          | Install [Pi](./providers-pi.md#set-up-pi) with Node.js 22.19 or newer, then run `pi` and `/login`.                                                        |
| Muse Code   | Install [Muse Code](https://dev.meta.ai/docs/muse-code) on the server, run `muse login`, then enable it in Settings → Providers.                          |
| fx          | Install [fx](https://fx.sh) with `curl -fsSL https://fx.sh/setup.sh \| bash`, then run `fx login`.                                                        |

Provider CLIs must be on the server's `PATH`. If Fab cannot find one, set its
**Binary path** in provider settings, especially when using a version manager.
Cursor's executable is `cursor-agent`, although its login command is
`agent login`. Codex connected through ChatGPT and Antigravity can use their
managed runtimes without a `PATH` entry.

Fab warns when a provider version has known compatibility problems with your
release. Check **Settings → Providers** on that environment for the recommended
version or range. When its package manager supports installing a specific version,
you can install the recommendation there. Otherwise use the provider's installer
on the environment's machine. An unlisted version is unverified.

When a provider CLI is behind its latest release, its provider card shows the
available version. **Update now** runs the installer that owns the CLI
(Homebrew, or a global npm, pnpm, Yarn, Bun, Volta, or Vite+ install), or the
CLI's own update command when Fab cannot tell. Update a CLI installed with
mise through mise. Cursor and Antigravity update with Fab. Homebrew installs
compare against the version Homebrew offers, which can trail the npm release.

Add another provider instance for a separate account or configuration. Each
instance can have its own environment variables, such as API keys or a custom
base URL. Mark secret values as sensitive; after saving, Fab does not display
their original values.

For provider-specific setup and accounts, see [Codex](./providers-codex.md),
[Claude](./providers-claude.md), [OpenCode](./providers-opencode.md),
[Antigravity](./providers-antigravity.md), [Kiro](./providers-kiro.md),
[Pi](./providers-pi.md), [Muse Code](./providers-muse.md), and [fx](./providers-fx.md).

## Next steps

- [Working with threads](./thread-sidebar.md): start tasks and organize parallel work.
- [Permission modes](./permission-modes.md): choose when agents ask before acting.
- [Remote access](./remote-access.md): connect from another device.
- [Running in the background](./background-service.md): keep a Linux or macOS host available.
- [Updating Fab](./updating.md): update the app and connected servers.
- [Managed policy](./managed-policy.md): configure Fab for everyone on a machine.
