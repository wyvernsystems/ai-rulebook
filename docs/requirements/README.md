# Requirements

Working requirements for the **AI Rulebook** extension, one file per
feature. Each requirement has a stable ID; tests name the IDs they cover,
so `grep -rn "PACK-" tests/` finds the tests for a feature. Never reuse or
renumber an ID; retire one by deleting it and leaving the gap.

| Feature | IDs | File |
| --- | --- | --- |
| Rule pack: install, render, toggle, remove | `PACK-` | [rule-pack.md](./rule-pack.md) |
| Activation and auto-install | `AUTO-` | [activation.md](./activation.md) |
| Sidebar, status bar, and commands | `UI-` | [sidebar-and-status.md](./sidebar-and-status.md) |
| Agent modes (subagent, parallel) | `MODE-` | [agent-modes.md](./agent-modes.md) |
| Legacy per-tool folder cleanup | `LEGACY-` | [legacy-cleanup.md](./legacy-cleanup.md) |
| Bundle and packaging | `BUNDLE-` | [bundle-and-packaging.md](./bundle-and-packaging.md) |
| Project constraints | `PROJ-` | [project.md](./project.md) |
