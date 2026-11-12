# Sidebar, status bar, and commands

## Purpose

Show each rule's state and the agent mode at a glance, and let the user
change them without editing `AGENTS.md` by hand.

## Requirements

- **UI-1** — The sidebar tree view lists every topic rule with a checkbox
  and colors active rule labels green and disabled ones red (via a
  `FileDecorationProvider`). Clicking a checkbox edits that rule's section
  in the first workspace folder's `AGENTS.md`.
- **UI-2** — Selecting a rule's name opens `AGENTS.md` at that rule's
  section (`AI Rulebook: Open rule file`, hidden from the command palette,
  where it would have no argument).
- **UI-3** — When the sidebar cannot read or parse `AGENTS.md`, affected
  rules show `Unable to read` with the error in the tooltip and no
  checkbox, instead of claiming they are disabled.
- **UI-4** — The sidebar has an **Agent mode** row after the rules showing
  Off, the active mode, or `Conflict: more than one on`; selecting it opens
  the agent mode picker.
- **UI-5** — Command-palette actions enable or disable one selected topic
  rule, and separate actions enable or disable the whole rule pack. They act
  on the first workspace folder.
- **UI-6** — A status bar item shows the enabled-rule count and agent mode
  for the first workspace folder (`AI 7/7 · parallel`, `AI 7/7 · subagent`;
  the tooltip names the mode), or a warning (`AI 7/7 · 2 modes`) when both
  mode blocks are present. A damaged block shows a warning for the first
  folder.
- **UI-7** — The status bar is populated on activation, refreshed after
  every action that changes rule state, and refreshed when a folder's root
  `AGENTS.md` changes on disk (one file watcher per folder).
- **UI-8** — Clicking the status bar runs `AI Rulebook: Show rule pack
  status`, which focuses the sidebar and writes a plain-text snapshot to the
  Output channel: each rule's state, whether each agent mode is on, and a
  warning line when both mode blocks are present.
- **UI-9** — No sidebar or palette command is hidden based on whether the
  host is Cursor or plain VS Code.

## Out of scope

- Editing user settings (`settings.json`).

## Where it lives

- Code: `src/sidebarTreeView.ts`, `src/ruleStatusUi.ts`,
  `src/uiPresentation.ts`, `src/extension.ts`, `package.json`
  (`contributes`).
- Tests: `tests/vscodeModules.test.mjs`,
  `tests/packageContributions.test.mjs`.
