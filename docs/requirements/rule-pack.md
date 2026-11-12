# Rule pack

## Purpose

Install the seven bundled topic rules into each workspace's `AGENTS.md` as
one managed block, keep it current, toggle rules, and remove it cleanly.

## Requirements

- **PACK-1** — The extension installs seven topic rules (`scope.mdc`,
  `code.mdc`, `tests.mdc`, `docs.mdc`, `markdown.mdc`, `git.mdc`,
  `review.mdc`) as one managed block inside `AGENTS.md` at the root of each
  open workspace folder. Every rule is installed enabled.
- **PACK-2** — The block is delimited by `<!-- ai-rulebook:start -->` and
  `<!-- ai-rulebook:end -->`. Inside it, each rule has its own section
  delimited by `<!-- ai-rulebook:rule <id> enabled|disabled -->` and
  `<!-- ai-rulebook:end-rule <id> -->`, in manifest order. Text outside the
  block is preserved on update; a first install may append separating
  newlines, and removal normalizes whitespace around the removed block.
- **PACK-3** — When `AGENTS.md` does not exist, install creates it with a
  `# AGENTS.md` title followed by the block. When it exists without a
  block, the block is appended. When it holds a block, the block is
  replaced in place.
- **PACK-4** — Rule text is rendered from `bundled/ai-rules/*.mdc` on the
  way into `AGENTS.md`: the Cursor frontmatter is removed,
  `{{TEST_COMMAND}}` is replaced with the detected test command (or "the
  project's test command"), and ATX headings are demoted one level (never
  past `######`; fenced code is left alone).
- **PACK-5** — The test command is detected from a `package.json` `test`
  script (lockfile picks `npm`, `pnpm`, `yarn`, or `bun`; the `npm init`
  placeholder counts as none), `Cargo.toml`, `go.mod`, pytest
  configuration, or a `Makefile` `test` target. An unparseable
  `package.json` is inconclusive.
- **PACK-6** — Disabling a rule removes its text from `AGENTS.md` and marks
  its section `disabled`; enabling writes the text back from the bundle
  with the current test command. Toggles edit only that rule's section. A
  rule's state is what its section marker says.
- **PACK-7** — Overlapping install, toggle, and removal operations in one
  extension host apply in invocation order per workspace, without losing
  changes or corrupting the block. A failed operation does not block later
  ones.
- **PACK-8** — Re-running install refreshes every section's text, keeps each
  rule's recorded state, adds sections for rules new to the bundle, and
  drops sections for rules the bundle no longer ships.
- **PACK-9** — Install ensures `CLAUDE.md` imports `AGENTS.md`: it creates
  `CLAUDE.md` containing `@AGENTS.md` when missing, appends the line when
  the file exists without an import, and leaves the file alone when
  `@AGENTS.md` already appears outside code fences and inline code.
- **PACK-10** — The extension never modifies the workspace `.gitignore`;
  `AGENTS.md` and `CLAUDE.md` stay committable.
- **PACK-11** — A block whose markers are damaged (a start without an end,
  two blocks, an unterminated or duplicated rule section) is never
  rewritten. Install and toggle operations fail on it.
- **PACK-12** — The rule on / off commands and the sidebar checkboxes
  require the block. When it is missing they report that the rule pack is
  not installed and name the install command, instead of reporting a
  success that changed nothing.
- **PACK-13** — `AI Rulebook: Remove rule pack` deletes the block from
  `AGENTS.md` in every open folder after a confirmation. When the remaining
  text is empty or only `# AGENTS.md`, the file is deleted and standalone
  `@AGENTS.md` lines outside fences are removed from `CLAUDE.md` (deleting
  it if empty). File ownership is inferred from content, not recorded.
  Prose imports remain. If `AGENTS.md` remains, `CLAUDE.md` is unchanged.
- **PACK-14** — Import removal preserves `@AGENTS.md` examples inside fenced
  code blocks in `CLAUDE.md`.
- **PACK-15** — `review.mdc` applies only when the user explicitly asks for
  a full or thorough code review; agents never start one unprompted. It
  scopes to unpushed changes (or a named range), fixes findings pass by
  pass, reports licensing concerns without fixing them, runs tests, lint,
  and type checks, then commits and pushes without force-pushing.
- **PACK-16** — The bundled rules constrain task scope (including refactors
  and small defect fixes), code reuse and organization, dependency choices,
  input and error safety, testing integrity and scoped test runs, triggered
  documentation updates and placement, Markdown formatting, and unrequested
  Git mutations. Each rule stays focused, imperative, and scannable.

## Out of scope

- Guaranteeing that an agent follows every active rule; models may drop
  rules under context pressure (README → *Limitations*).
- Locking file mutations across extension hosts or external processes.

## Where it lives

- Code: `src/agentsMd.ts`, `src/claudeMd.ts`, `src/testCommand.ts`,
  `src/extension.ts`, `bundled/ai-rules/`.
- Tests: `tests/agentsMd.test.mjs`, `tests/claudeMd.test.mjs`,
  `tests/testCommand.test.mjs`, `tests/vscodeModules.test.mjs`.
- No automated test: PACK-16 (rule content, reviewed by hand).
