# Bundle and packaging

## Purpose

Keep the shipped rule bundle valid and the VSIX limited to what the
extension needs at runtime.

## Requirements

- **BUNDLE-1** — The source of truth for rule text is `bundled/ai-rules/`,
  the copy shipped in the VSIX. An installed `AGENTS.md` is a rendered
  copy, not byte-identical to the source.
- **BUNDLE-2** — `npm run verify:bundled` must pass before packaging. It
  checks that `bundled/manifest.json` lists exactly the rules in
  `bundled/ai-rules/`, that every rule has a frontmatter `description`, and
  that no rule carries a placeholder the extension cannot render. It also
  checks that `bundled/subagent-mode/` and `bundled/parallel-mode/` each
  hold exactly `section.md` with only known placeholders.
- **BUNDLE-3** — Bundle sync and verification reject any source file not
  ending in `.mdc`, including the obsolete `.mdc.disabled` format. Disabled
  state lives only in the installed `AGENTS.md` block.
- **BUNDLE-4** — `npm run sync-bundled` compiles, regenerates
  `bundled/manifest.json`, and writes `bundled/standalone/README.md` and
  `bundled/standalone/AGENTS.md` (what the extension writes into a fresh
  workspace, rendered by the compiled `agentsMd` module with
  `{{TEST_COMMAND}}` as generic prose). The standalone files are tracked in
  git and excluded from the VSIX.
- **BUNDLE-5** — The manifest is validated at activation: each entry is a
  forward-slash relative path matching `^[A-Za-z0-9_./-]+$`, with no `..`
  segments, no leading `/` or `./`, and at most 200 characters. A malformed
  manifest aborts activation with a clear error. Standalone generation uses
  the same validator before writing.
- **BUNDLE-6** — Path containment is asserted on every operation that
  resolves a manifest entry under the bundle directory. Out-of-tree paths
  throw before any filesystem call, and every bundled rule is read before
  `AGENTS.md` is written.
- **BUNDLE-7** — The VSIX holds only compiled JS (`out/**`), the rule pack
  (`bundled/ai-rules/**`, `bundled/manifest.json`), both mode texts
  (`bundled/subagent-mode/section.md`, `bundled/parallel-mode/section.md`),
  `icon.png`, `LICENSE`, `README.md`, `CHANGELOG.md`, and `package.json`.
  Repository `AGENTS.md` and `CLAUDE.md`, sources, scripts, lockfiles, build
  info, legacy ZIP archives, the icon master, and other tooling files are
  excluded via `.vscodeignore`.
- **BUNDLE-8** — The marketplace icon is a PNG of at most 128×128. The
  high-resolution master (`icon-source.png`) is kept locally and excluded
  from the package.

## Out of scope

- Shipping per-language linters, formatters, or build tooling; the
  extension ships only Markdown rule text and the UI to manage it.

## Where it lives

- Code: `scripts/sync-bundled.mjs`, `scripts/verify-bundled.mjs`,
  `scripts/build-standalone.mjs`, `src/manifest.ts`, `src/safePaths.ts`,
  `.vscodeignore`.
- Tests: `tests/bundleScripts.test.mjs`, `tests/manifest.test.mjs`,
  `tests/safePaths.test.mjs`, `tests/project.test.mjs` (BUNDLE-8).
- Release steps: [`docs/RELEASING.md`](../RELEASING.md).
- No automated test: BUNDLE-1 (a definition) and BUNDLE-7 (checked with
  `npx vsce ls` during a release).
