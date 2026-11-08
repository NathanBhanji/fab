# Fab

Fab is a minimal GUI for coding agents. It runs the agents already set up on your machine and lets you drive them from a desktop app, a web app, or your iPhone.

It works with your existing subscriptions to Codex, Claude Code, Cursor, Grok Build, OpenCode, Antigravity, Kiro, Pi, Muse Code and fx. Fab does not resell model access. If a provider works in your terminal, Fab can control it.

## Platforms

- **Desktop and server:** macOS and Linux (Ubuntu)
- **Mobile:** iPhone

## Status

Fab is early and changes quickly. There are no published releases yet, so run it from source.

Fab is not accepting outside contributions. Pull requests are limited to collaborators.

## Run from source

Install at least one provider and sign in to it first. For example, run `codex login` or `claude auth login`. The [provider guides](./docs/README.md) cover each one.

Fab uses [Vite+](https://viteplus.dev/guide/). Install its `vp` command, then the dependencies:

```bash
curl -fsSL https://vite.plus | bash
vp i
```

Then start Fab:

| What                          | Command                     |
| ----------------------------- | --------------------------- |
| Server and web app            | `vp run dev`                |
| Desktop app                   | `vp run dev:desktop`        |
| Share with your other devices | `vp run dev --share`        |
| iPhone app (simulator)        | `vp run mobile:install ios` |

The [development runbook](./docs/operations/development.md) has the details, including ports, test data and mobile setup.

## Documentation

Docs live in [docs/](./docs/README.md). User guides are in [docs/user](./docs/user), and the architecture starts at [docs/internals/overview.md](./docs/internals/overview.md).

## Origins

Fab started from [T3 Code](https://github.com/pingdotgg/t3code) v0.1.7 by T3 Tools Inc. and has diverged on purpose: it does not track upstream. Both are MIT licensed. See [LICENSE](./LICENSE).
