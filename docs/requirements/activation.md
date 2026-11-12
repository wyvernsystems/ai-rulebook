# Activation and auto-install

## Purpose

Install the rule pack where agents are already in use without being asked,
and offer a refresh after an extension update.

## Requirements

- **AUTO-1** — On activation, when `aiRules.autoInstallOnOpenWorkspace` is
  on (default `true`), the extension installs the rule pack into every open
  folder that has no block yet and shows evidence of AI-agent use: an
  `AGENTS.md`, `CLAUDE.md`, `CLAUDE.local.md`, `.claude/`, `.cursor/`,
  `.cursorrules`, `.clinerules/`, `.opencode/`, `opencode.json`,
  `opencode.jsonc`, `.windsurf/`, `.windsurfrules`,
  `.github/copilot-instructions.md`, or `.github/instructions/` entry.
- **AUTO-2** — A Cursor host (`vscode.env.uriScheme === "cursor"` or an
  `appName` containing `"cursor"`) or an installed Cline extension
  (`saoudrizwan.claude-dev` / `saoudrizwan.cline-nightly`) counts as
  evidence for every folder.
- **AUTO-3** — Folders that already carry a block are left alone, including
  their disabled rules.
- **AUTO-4** — When auto-install skips at least one folder for lack of
  evidence and installs into none, the extension shows a one-time hint
  naming the install command, persisted in `globalState` under
  `aiRules.autoInstallSkippedNoticeShown` so it does not repeat while that
  state is retained.
- **AUTO-5** — When auto-install is on and a folder's block has damaged
  markers, activation reports the problem and does not rewrite the file.
- **AUTO-6** — When a previous extension version is recorded in global
  state, the version changes, a folder is open, and
  `aiRules.promptInstallOnUpdate` is on (default `true`), the extension
  offers to re-run install. This is not tracked per workspace.
- **AUTO-7** — Filesystem failures during agent-evidence checks include the
  affected path; only missing files count as absent.

## Out of scope

- Removing the pack does not disable auto-install.

## Where it lives

- Code: `src/extension.ts`, `src/rulesOperations.ts`
  (`workspaceShowsAgentEvidence`), `src/cursor.ts`, `src/cline.ts`.
- Tests: `tests/vscodeModules.test.mjs`, `tests/rulesOperations.test.mjs`.
