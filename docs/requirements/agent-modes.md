# Agent modes

## Purpose

Optional `AGENTS.md` blocks that change how an agent orchestrates
subagents: token-efficient subagent mode trades speed for cost, fast
parallel agent mode trades cost for speed. At most one is on.

## Requirements

### Shared

- **MODE-1** — Each mode is **off by default** and separate from the rule
  pack: install, the rule toggles, `Enable all rules`, auto-install, and
  `Remove rule pack` never write or remove it.
- **MODE-2** — Each mode is turned on and off only by its own enable and
  disable commands, or by `AI Rulebook: Select agent mode…`, and acts on
  every open folder.
- **MODE-3** — Enabling writes the mode's managed block into `AGENTS.md`,
  outside the rule pack block and through the same per-workspace operation
  queue. The block is rendered from the mode's `bundled/<mode>/section.md`
  the way a rule is (headings demoted, `{{TEST_COMMAND}}` replaced) before
  anything is written. Enabling also ensures the `@AGENTS.md` import in
  `CLAUDE.md`. Running it again replaces the block in place.
- **MODE-4** — A mode writes nothing outside `AGENTS.md` and the `CLAUDE.md`
  import: no per-tool agent folders and no tool settings.
- **MODE-5** — Disabling removes the block, deleting `AGENTS.md` and the
  `CLAUDE.md` import under the same rules as `Remove rule pack` (PACK-13).
  Damaged markers fail enable, disable, and status without rewriting
  `AGENTS.md`.
- **MODE-6** — `Show rule pack status` reports whether each mode is on in
  the first workspace folder.
- **MODE-7** — The two modes are mutually exclusive in both directions:
  enabling either fails while the other's block is present. The enable
  command checks every open folder before writing; if any folder has the
  other mode on, it shows an error naming the other mode's disable command
  and `AI Rulebook: Select agent mode…`, and writes nothing in any folder.
  The check runs inside the per-workspace queue, so a concurrent enable or
  disable cannot slip between check and write.
- **MODE-8** — `AI Rulebook: Select agent mode…` opens a quick pick with
  Off, Token-efficient subagent mode, and Fast parallel agent mode, marking
  the current one (first folder). It switches every open folder, removing
  the other mode's block and writing the chosen one in a single write. Off
  removes the mode blocks, deleting `AGENTS.md` and the `CLAUDE.md` import
  when nothing else remains.
- **MODE-9** — The four enable / disable mode commands stay in the command
  palette; the sidebar toolbar has only Select agent mode….

### Token-efficient subagent mode

- **MODE-10** — The block is delimited by
  `<!-- ai-rulebook:subagent-mode:start -->` and
  `<!-- ai-rulebook:subagent-mode:end -->`, rendered from
  `bundled/subagent-mode/section.md`.
- **MODE-11** — Its text stands alone: it names model tiers (fast,
  standard, deep) rather than one vendor's models, tells tools without
  subagents to skip it, states which tier substitutes for an unavailable
  model (never one more expensive than the session model), and carries each
  delegate's contract. The orchestrator fixes a delegate's failed edit
  itself, resends a spec at most once, reviews high-risk diffs once after
  the checks pass, and reads the final diff before reporting.

### Fast parallel agent mode

- **MODE-12** — The block is delimited by
  `<!-- ai-rulebook:parallel-mode:start -->` and
  `<!-- ai-rulebook:parallel-mode:end -->`, rendered from
  `bundled/parallel-mode/section.md`.
- **MODE-13** — Its text stands alone: it tells tools that cannot run
  subagents in parallel to skip it and states that it spends more tokens
  than working alone. The orchestrator scales to the task, splits work into
  units by file ownership, writes a shared contract before fan-out, spawns
  ready units in one message, never downgrades implementers to save tokens,
  never puts two units on one file in one checkout (worktrees or sequencing
  instead), runs at most five units at once, and falls back to working alone
  when fan-out stops paying.
- **MODE-14** — On integration the orchestrator merges worktree units one at
  a time (read the diff, apply, check, resolve conflicts against the
  contract without dropping either side, remove the worktree), runs tests
  covering every unit's changes and their dependents (the full suite when
  the Tests rule calls for it) plus lint and type checks on the combined
  result, fixes integration failures itself within two repair rounds, gets
  one required review of the combined diff on the strongest model, and reads
  the final diff. It carries each delegate's contract (implementer,
  researcher, reviewer).

## Out of scope

- Writing per-tool agent definitions or tool settings for either mode.
- Any relation to Claude Code's own `/fast` toggle.

## Where it lives

- Code: `src/agentModes.ts`, `src/subagentMode.ts`, `src/parallelMode.ts`,
  `src/extension.ts`, `bundled/subagent-mode/`, `bundled/parallel-mode/`.
- Tests: `tests/agentModes.test.mjs`, `tests/subagentMode.test.mjs`,
  `tests/parallelMode.test.mjs`, `tests/vscodeModules.test.mjs`.
