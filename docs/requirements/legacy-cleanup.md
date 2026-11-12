# Legacy cleanup

## Purpose

Remove the per-tool rule folders that releases before 4.0.0 generated,
without touching anything else.

## Requirements

- **LEGACY-1** — `AI Rulebook: Remove legacy per-tool rule folders…`
  deletes, after a confirmation and in every open folder:
  `.cursor/rules/ai-rules/`, `.clinerules/ai-rules/`,
  `.opencode/rules/ai-rules/`, `.opencode/command/ai-rulebook.md`,
  `.claude/rules/ai-rules/`, `.windsurf/rules/ai-rules/`, and
  `.github/instructions/ai-rules/`. `AGENTS.md` and the opencode config are
  not touched.
- **LEGACY-2** — Each deletion requires the target path to end with its
  expected segments (`.cursor/rules/ai-rules`, `.clinerules/ai-rules`,
  `.opencode/rules/ai-rules`, `.opencode/command/ai-rulebook.md`,
  `.claude/rules/ai-rules`, `.windsurf/rules/ai-rules`, or
  `.github/instructions/ai-rules`); anything else throws before deleting.
- **LEGACY-3** — Filesystem failures during cleanup include the affected
  path; only missing files count as absent.

## Out of scope

- Writing per-tool rule folders or editing tool config files (opencode
  config, Claude settings, and so on).

## Where it lives

- Code: `src/rulesOperations.ts` (`removeLegacyRuleFolders` and the
  per-tool removers), `src/safePaths.ts` (`assertSafeDeletionTarget`).
- Tests: `tests/rulesOperations.test.mjs`, `tests/safePaths.test.mjs`.
