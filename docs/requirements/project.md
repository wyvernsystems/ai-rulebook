# Project constraints

## Purpose

Project-wide constraints every feature must respect: licensing, runtime,
safety, and the published listing.

## Requirements

- **PROJ-1** — License is MIT; a `LICENSE` file ships in the VSIX.
- **PROJ-2** — Publisher is `WyvernSystemsLLC`; the marketplace id is
  `WyvernSystemsLLC.ai-rulebook`.
- **PROJ-3** — Declared engines are VS Code `^1.85.0` and Node `>=18.18.0`.
  Development tools run on Node.js 24. CI tests Node 18 and 20 and runs
  `npm run lint` on Node 24 on pushes to `main` and every pull request.
- **PROJ-4** — No runtime dependencies. Dev dependencies are limited to
  `@types/*`, `@vscode/vsce`, `ovsx`, and TypeScript and ESLint tooling.
- **PROJ-5** — The extension never makes outbound network calls.
- **PROJ-6** — The extension never reads or writes credentials, tokens,
  environment variables, or anything outside its allowed paths.
- **PROJ-7** — The extension writes only inside the open workspace folders,
  and only to `AGENTS.md` (its managed blocks) and `CLAUDE.md` (the
  `@AGENTS.md` line). The only deletions are the legacy targets in
  LEGACY-1 and the files PACK-13 allows.
- **PROJ-8** — `README.md` is the marketplace description: plain English,
  listing the shipped rules, every command, and rule limitations.
- **PROJ-9** — `CHANGELOG.md` follows
  [Keep a Changelog](https://keepachangelog.com/) with an `[Unreleased]`
  section at the top.

## Out of scope

- Calling any AI provider, logging telemetry, or syncing anything to the
  cloud.
- Editing user settings (`settings.json`).

## Where it lives

- Code: `package.json`, `.github/workflows/ci.yml`, `LICENSE`, `README.md`,
  `CHANGELOG.md`.
- Tests: `tests/project.test.mjs`. PROJ-5 and PROJ-6 are checked by
  allowlisting the modules `src/` may import.
- No automated test: PROJ-7 (write locations, enforced in review and by the
  per-feature tests that check which files each command touches).
