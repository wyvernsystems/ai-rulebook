# Requirements

This document captures the working requirements, constraints, and non-goals
for the **AI Rulebook** extension. Short, testable bullets only — implementation
details belong in the code or in the rule files.

## Functional

- The extension installs seven topic rules (`scope.mdc`, `code.mdc`,
  `tests.mdc`, `docs.mdc`, `markdown.mdc`, `git.mdc`, and `review.mdc`) as one managed
  block inside `AGENTS.md` at the root of each open workspace folder. Every
  rule is installed enabled by default.
- The managed block is delimited by `<!-- ai-rulebook:start -->` and
  `<!-- ai-rulebook:end -->`. Inside it, each rule has its own section
  delimited by `<!-- ai-rulebook:rule <id> enabled|disabled -->` and
  `<!-- ai-rulebook:end-rule <id> -->`, in manifest order. Text outside the
  block is preserved during an update; a first install may append separating
  newlines, and removal normalizes whitespace around the removed block.
- When `AGENTS.md` does not exist, install creates it with a `# AGENTS.md`
  title followed by the block. When it exists without a block, the block is
  appended. When it already holds a block, the block is replaced in place.
- `review.mdc` applies only when the user explicitly asks for a full or
  thorough code review; agents never start one unprompted. It scopes to
  unpushed changes (or a named range), fixes findings pass by pass, reports
  licensing concerns without fixing them, runs tests, lint, and type checks,
  then commits and pushes without force-pushing.
- Rule text is rendered from `bundled/ai-rules/*.mdc` on the way into
  `AGENTS.md`: the Cursor frontmatter is removed, `{{TEST_COMMAND}}` is
  replaced with the detected test command (or "the project's test command"),
  and ATX headings are demoted one level (never past `######`; fenced code
  is left alone).
- Disabling a rule removes its text from `AGENTS.md` and marks its section
  `disabled`; enabling it writes the text back from the bundle with the
  current test command. Toggles edit only that rule's section. The rule's
  state is what the section marker says.
- Overlapping install, toggle, and removal operations in one extension host
  apply in invocation order per workspace, without losing changes or
  corrupting the block. A failed operation does not block later operations.
- Re-running install refreshes every section's text, keeps each rule's
  recorded state, adds sections for rules new to the bundle, and drops
  sections for rules the bundle no longer ships.
- Install also ensures `CLAUDE.md` imports `AGENTS.md`: it creates
  `CLAUDE.md` containing `@AGENTS.md` when the file is missing, appends the
  line when the file exists without an import, and leaves the file alone
  when `@AGENTS.md` already appears outside code fences and inline code.
- The extension does **not** modify the workspace `.gitignore`. `AGENTS.md`
  and `CLAUDE.md` are left unignored so they can be committed and shared.
- On activation, when `aiRules.autoInstallOnOpenWorkspace` is on (default
  `true`), the extension installs the rule pack into every open folder that
  has no block yet and shows evidence of AI-agent use: an `AGENTS.md`,
  `CLAUDE.md`, `CLAUDE.local.md`, `.claude/`, `.cursor/`, `.cursorrules`,
  `.clinerules/`, `.opencode/`, `opencode.json`, `opencode.jsonc`,
  `.windsurf/`, `.windsurfrules`, `.github/copilot-instructions.md`, or
  `.github/instructions/` entry. A Cursor host (`vscode.env.uriScheme ===
  "cursor"` or an `appName` containing `"cursor"`) or an installed Cline
  extension (`saoudrizwan.claude-dev` / `saoudrizwan.cline-nightly`) counts
  as evidence for every folder. Folders that already carry a block are
  left alone, including their disabled rules.
- When auto-install skips at least one folder for lack of evidence and
  installs into none, the extension
  shows a one-time informational hint naming the install command. The hint
  is persisted via `globalState` under `aiRules.autoInstallSkippedNoticeShown`
  so it is not repeated while that global state is retained.
- A block whose markers are damaged (a start without an end, two blocks, an
  unterminated or duplicated rule section) is never rewritten. Activation
  reports the problem when auto-install is enabled; the status bar shows a
  warning for the first folder, and install and toggle operations fail.
- The sidebar tree view lists every topic rule with a checkbox and colors
  active rule labels green and disabled rule labels red (via a
  `FileDecorationProvider`). Clicking a checkbox edits that rule's section
  in the first workspace folder's `AGENTS.md`. Selecting a rule's name opens
  `AGENTS.md` at that rule's section (`AI Rulebook: Open rule file`, hidden
  from the command palette where it would have no argument to act on).
- Command-palette actions enable or disable one selected topic rule, and
  separate actions enable or disable the complete rule pack. They act on the
  first workspace folder.
- The rule on / off commands and the sidebar checkboxes require the block to
  be installed. When it is missing they report that the rule pack is not
  installed and name the install command, instead of reporting a success
  that changed nothing.
- A status bar item shows the enabled-rule count and agent mode for the first
  workspace folder (`AI 7/7 · parallel`, `AI 7/7 · subagent`; the tooltip
  names the mode). When both mode blocks are present it shows a warning
  (`AI 7/7 · 2 modes`). Clicking it runs `AI Rulebook: Show rule pack status`,
  which focuses the sidebar and writes a plain-text snapshot to the Output
  channel. It is populated on activation, refreshed after every action that
  changes rule state, and refreshed when a workspace folder's root
  `AGENTS.md` changes on disk (a file watcher per folder).
- `AI Rulebook: Select agent mode…` opens a quick pick with Off,
  Token-efficient subagent mode, and Fast parallel agent mode, marking the
  current one (first folder). It switches every open folder: it removes the
  other mode's block and writes the chosen one in a single write. Off removes
  the mode blocks, deleting `AGENTS.md` and the `CLAUDE.md` import when
  nothing else remains. The four enable / disable mode commands remain in the
  command palette; the sidebar toolbar has only Select agent mode…. A mode
  conflict error from enable also points to Select agent mode….
- The sidebar has an **Agent mode** row after the rules showing Off, the
  active mode, or `Conflict: more than one on`; selecting it opens the picker.
  `Show rule pack status` prints a warning line when both mode blocks are
  present.
- `AI Rulebook: Remove rule pack` deletes the block from `AGENTS.md` in every
  open folder after a confirmation. When the remaining text is empty or
  only `# AGENTS.md`, the file is deleted and standalone `@AGENTS.md` lines
  outside fences are removed from `CLAUDE.md` (deleting it if empty). File
  ownership is inferred from content, not recorded. Prose imports remain.
  If `AGENTS.md` remains, `CLAUDE.md` is unchanged.
- Import removal preserves `@AGENTS.md` examples inside fenced code blocks
  in `CLAUDE.md`.
- `AI Rulebook: Remove legacy per-tool rule folders…` deletes, after a
  confirmation and in every open folder, the mirrors earlier releases
  generated: `.cursor/rules/ai-rules/`, `.clinerules/ai-rules/`,
  `.opencode/rules/ai-rules/` and `.opencode/command/ai-rulebook.md`,
  `.claude/rules/ai-rules/`, `.windsurf/rules/ai-rules/`, and
  `.github/instructions/ai-rules/`. `AGENTS.md` and the opencode config are
  not touched.
- Token-efficient subagent mode is **off by default** and separate from the
  rule pack: install, the rule toggles, `Enable all rules`, auto-install, and
  `Remove rule pack` never write or remove it. It is turned on and off only
  by `AI Rulebook: Enable token-efficient subagent mode` and
  `AI Rulebook: Disable token-efficient subagent mode`, which act on every
  open folder.
- Enabling the mode writes a second managed block into `AGENTS.md`, delimited
  by `<!-- ai-rulebook:subagent-mode:start -->` and
  `<!-- ai-rulebook:subagent-mode:end -->`, outside the rule pack block and
  through the same per-workspace operation queue. It is rendered from
  `bundled/subagent-mode/section.md` the way a rule is (headings demoted,
  `{{TEST_COMMAND}}` replaced) before anything is written. Enabling also
  ensures the `@AGENTS.md` import in `CLAUDE.md`. Running it again replaces
  the block in place.
- The mode writes nothing outside `AGENTS.md` and the `CLAUDE.md` import: no
  per-tool agent folders and no tool settings. Its text must therefore stand
  alone: it names model tiers (fast, standard, deep) rather than one
  vendor's models, tells tools without subagents to skip it, states which
  tier to substitute when a model is unavailable (never a model more
  expensive than the session model), and carries each delegate's contract.
  It also has the orchestrator fix a delegate's failed edit itself, resend a
  spec at most once, review high-risk diffs once after the checks pass, and
  read the final diff before reporting.
- Disabling removes the block, deleting `AGENTS.md` and the `CLAUDE.md`
  import under the same rules as `Remove rule pack`. Damaged
  `ai-rulebook:subagent-mode` markers fail enable, disable, and status
  without rewriting `AGENTS.md`.
- `Show rule pack status` reports whether the mode is on in the first
  workspace folder.
- Fast parallel agent mode is **off by default** and separate from the rule
  pack, like token-efficient subagent mode: install, the rule toggles,
  `Enable all rules`, auto-install, and `Remove rule pack` never write or
  remove it. It is turned on and off only by
  `AI Rulebook: Enable fast parallel agent mode` and
  `AI Rulebook: Disable fast parallel agent mode`, which act on every open
  folder.
- Enabling it writes a managed block into `AGENTS.md`, delimited by
  `<!-- ai-rulebook:parallel-mode:start -->` and
  `<!-- ai-rulebook:parallel-mode:end -->`, outside the rule pack block and
  through the same per-workspace operation queue. It is rendered from
  `bundled/parallel-mode/section.md` the way a rule is (headings demoted,
  `{{TEST_COMMAND}}` replaced) before anything is written. Enabling also
  ensures the `@AGENTS.md` import in `CLAUDE.md`. Running it again replaces
  the block in place. It writes nothing else: no per-tool agent folders and
  no tool settings.
- Its text must stand alone. It tells tools that cannot run subagents in
  parallel to skip it and states that it spends more tokens than working
  alone. It has the orchestrator scale to the task, split work into units by
  file ownership, write a shared contract before fan-out, spawn ready units
  in one message, never downgrade implementers to save tokens, never put two
  units on one file in one checkout (worktrees or sequencing instead), run
  at most five units at once, fall back to working alone when fan-out stops
  paying, merge worktree units one at a time (read the diff, apply, check,
  resolve conflicts against the contract without dropping either side, remove
  the worktree), integrate and run the full test, lint, and type checks on the combined
  result, fix integration failures itself within two repair rounds, get one
  required review of the combined diff on the strongest model, read the
  final diff. It also carries each delegate's contract (implementer,
  researcher, reviewer).
- Disabling removes the block, deleting `AGENTS.md` and the `CLAUDE.md`
  import under the same rules as `Remove rule pack`. Damaged
  `ai-rulebook:parallel-mode` markers fail enable, disable, and status
  without rewriting `AGENTS.md`. `Show rule pack status` reports whether the
  mode is on in the first workspace folder.
- Token-efficient subagent mode and fast parallel agent mode are mutually
  exclusive in both directions: enabling either fails while the other's block
  is present. The enable command checks every open folder before writing; if
  any folder has the other mode on, it shows an error naming the other mode's
  disable command (and `AI Rulebook: Select agent mode…`) and writes nothing
  in any folder (all-or-nothing). The
  check runs inside the per-workspace operation queue, so a concurrent enable
  or disable cannot slip between the check and the write.
- When a previous extension version is recorded in global state, the
  version changes, a folder is open, and `aiRules.promptInstallOnUpdate` is
  on (default `true`), the extension offers to re-run install. This is not
  tracked separately per workspace.
- No sidebar or palette command is hidden based on whether the host is
  Cursor or plain VS Code.
- Source of truth for rule text is `bundled/ai-rules/`, the copy shipped in
  the VSIX. `AGENTS.md` is a rendered install, not byte-identical to the
  source.
- `npm run verify:bundled` must pass before packaging. It checks that
  `bundled/manifest.json` lists exactly the rules in `bundled/ai-rules/`, that
  every rule has a `description` in its frontmatter, and that no rule carries
  a placeholder the extension cannot render. It also checks that
  `bundled/subagent-mode/` and `bundled/parallel-mode/` each hold exactly
  `section.md` and that each carries only known placeholders.
- Bundle sync and verification reject any source file that does not end in
  `.mdc`, including the obsolete `.mdc.disabled` format. Disabled state lives
  only in the installed `AGENTS.md` block.
- `npm run sync-bundled` compiles, regenerates `bundled/manifest.json`, and
  writes `bundled/standalone/README.md` and `bundled/standalone/AGENTS.md` — the file the extension writes into
  a fresh workspace, produced by the compiled `agentsMd` module with
  `{{TEST_COMMAND}}` rendered as generic prose. It is tracked in git so
  someone can grab the rules without installing the extension, and excluded
  from the VSIX (`.vscodeignore`) since the extension only ever reads from
  `bundled/ai-rules/`.
- The bundled rules constrain task scope, code reuse and organization,
  dependency choices, input and error safety, testing integrity, triggered
  documentation updates, Markdown formatting, and unrequested Git mutations.

## Non-functional

- **License**: MIT. A `LICENSE` file ships in the VSIX.
- **Publisher**: `WyvernSystemsLLC`. Marketplace package id
  `WyvernSystemsLLC.ai-rulebook`.
- **Declared engines**: VS Code `^1.85.0`, Node `>=18.18.0`. The locked
  development tools use Node.js 24. CI tests Node 18 and 20 and runs
  `npm run lint` on Node 24 on pushes to `main` and every pull request.
- **No runtime dependencies.** Only `@types/*`, `@vscode/vsce`, `ovsx`, and
  TypeScript and ESLint tooling as devDependencies.
- **No network access.** The extension must never make outbound HTTP calls.
- **No secret material.** The extension must never read or write credentials,
  tokens, environment variables, or anything outside its allowed paths.
- The extension only writes inside well-known locations in the open
  workspace folders: `AGENTS.md` (its managed blocks only) and `CLAUDE.md`
  (the `@AGENTS.md` line only). The legacy cleanup command deletes only the
  six per-tool folders and the opencode command file listed above. Nowhere
  else.
- **Manifest validation at activation.** Each entry must be a forward-slash
  relative path matching `^[A-Za-z0-9_./-]+$`, with no `..` segments, no
  leading `/` or `./`, and ≤ 200 chars. A malformed manifest aborts
  activation with a clear error.
- Standalone bundle generation uses the same manifest validator before
  writing generated files.
- Filesystem failures during test-command detection, agent-evidence checks,
  and legacy cleanup must include the affected path; only missing files are
  treated as absent. An unparseable `package.json` remains inconclusive for
  test-command detection.
- When the sidebar cannot read or parse `AGENTS.md`, affected rules show
  `Unable to read` with the error in the tooltip and no checkbox, instead of
  claiming they are disabled.
- **Path containment** is asserted on every operation that resolves a
  manifest entry under the bundle directory. Out-of-tree paths must throw
  before any filesystem call, and every bundled rule is read before
  `AGENTS.md` is written.
- **Destructive operations** on legacy folders require the target path to
  end with `.cursor/rules/ai-rules`, `.clinerules/ai-rules`,
  `.opencode/rules/ai-rules`, `.opencode/command/ai-rulebook.md`,
  `.claude/rules/ai-rules`, `.windsurf/rules/ai-rules`, or
  `.github/instructions/ai-rules` respectively.
- **VSIX contents** are limited to compiled JS (`out/**`), the bundled rule
  pack (`bundled/ai-rules/**`, `bundled/manifest.json`), the subagent mode
  text (`bundled/subagent-mode/section.md`), the fast parallel agent mode text
  (`bundled/parallel-mode/section.md`), `icon.png`
  (≤ 128×128 PNG), `LICENSE`, `README.md`, `CHANGELOG.md`, and
  `package.json`. Repository `AGENTS.md` and `CLAUDE.md`, source, scripts,
  lockfiles, build info, legacy ZIP archives, the high-resolution icon master,
  and other tooling files are excluded via
  `.vscodeignore`.
- **Marketplace icon** must be ≤ 128×128 PNG. The high-resolution master
  (`icon-source.png`) is preserved locally for re-rendering but excluded
  from the package.
- README is the marketplace description; it must be plain English and list
  the shipped rules, every command, and rule limitations.
- CHANGELOG follows [Keep a Changelog](https://keepachangelog.com/) with an
  `[Unreleased]` section at the top.
- Each topic rule must remain focused, imperative, and scannable.

## Out of scope

- The extension does **not** ship per-language linters, formatters, or build
  tooling — only Markdown rule text and the UI to manage it.
- The extension does **not** call any AI provider, log telemetry, or sync
  anything to the cloud.
- The extension does **not** edit user settings (`settings.json`).
- The extension does **not** write per-tool rule folders or edit tool
  config files (opencode config, Claude settings, and so on). That includes
  token-efficient subagent mode and fast parallel agent mode, which live only
  in `AGENTS.md`.
- File mutations are not locked across extension hosts or external
  processes; `Refresh sidebar` remains available. Removing the pack does not disable auto-install.
- The extension does **not** guarantee the AI follows every active rule —
  models may drop rules under context pressure (see README → *Limitations*).
